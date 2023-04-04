from core.database import pool, upsert_many, tables_info, tables_tree, tables_refs
from dataclasses import dataclass
from datetime import datetime
from time import time
from pathlib import Path
from math import floor, ceil
from concurrent.futures import ThreadPoolExecutor
import data_series.omni.database as omni
import data_series.gsm.database as gsm
import json, logging, traceback
import numpy as np

log = logging.getLogger('aides')

HOUR = 3600
MAX_EVENT_LENGTH_H = 48
MAX_EVENT_LENGTH = MAX_EVENT_LENGTH_H * HOUR
EXTREMUM_TYPES = ['min', 'max', 'abs_min', 'abs_max']
NO_POI_TYPES = ['range', 'coverage', *EXTREMUM_TYPES]
ENTITY_POI = [t for t in tables_info if 'time' in tables_info[t]]

SERIES = {
	"sw_speed": ["omni", "V"],
	"sw_density": ["omni", "D"],
	"sw_temperature": ["omni", "T"],
	"temperature_idx": ["omni", "Tidx"],
	"imf_scalar": ["omni", "B"],
	"imf_x": ["omni", "Bx"],
	"imf_y": ["omni", "By"],
	"imf_z": ["omni", "Bz"],
	"imf_y_gsm": ["omni", "By_gsm"],
	"imf_z_gsm": ["omni", "Bz_gsm"],
	"plasma_beta": ["omni", "beta"],
	"dst_index": ["omni", "Dst"],
	"kp_index": ["omni", "Kp"],
	"ap_index": ["omni", "Ap"],
	"A10": ["gsm", "A0"],
	"A10m": ["gsm", "A0m"],
	"Ax": ["gsm", "Ax"],
	"Ay": ["gsm", "Ay"],
	"Az": ["gsm", "Az"],
	"Axy": ["gsm", "Axy"],
}

def parse_extremum_poi(poi):
	poi_type = next((e for e in EXTREMUM_TYPES if poi.startswith(e)), None)
	poi_series = poi_type and poi[len(poi_type)+1:]
	return poi_type, poi_series

@dataclass
class GenericColumn:
	id: int
	created: datetime
	last_computed: datetime
	entity: str
	users: int
	type: str
	series: str
	poi: str
	shift: int
	name: str = None
	pretty_name: str = None
	description = None

	@classmethod
	def from_config(cls, desc):
		return cls(None, None, None, None, None, desc['type'], desc['series'], desc.get('poi'), desc.get('shift'))

	def __post_init__(self):
		name = f'g_{self.type}'
		if self.series: name += f'_{self.series}'
		if self.poi: name += f'_{self.poi}'
		if self.shift: name += f'_{abs(int(self.shift))}{"b" if self.shift < 0 else "a"}'
		self.name = name.lower().replace('%', 'pp')

		series, poi = self.series and self.type != 'clone' and SERIES[self.series][1], ''
		if 'abs' in self.type:
			series = f'abs({series})'
		elif self.poi in ENTITY_POI:
			poi = 'ons' if self.poi == self.entity else ''.join([a[0].upper() for a in self.poi.split('_')])
		elif self.poi and self.type != 'clone':
			typ, ser = parse_extremum_poi(self.poi)
			ser = SERIES[ser][1]
			poi = typ.split('_')[-1] + ' ' + (f'abs({ser})' if 'abs' in typ else ser)
		ser_desc, poi_desc = series and f'{SERIES[self.series][0]}({self.series})', poi if poi != "ons" else "event onset"
		if self.type == 'value':
			self.pretty_name = f'{series} [{poi}]'
			if self.shift and self.shift != 0:
				if abs(self.shift) == 1:
					self.description = f'Value of {ser_desc} one hour {"before" if self.shift<0 else "after"} {poi_desc}'
				else:
					self.description = f'Value of {ser_desc} averaged over {abs(self.shift)} hours {"before" if self.shift<0 else "after"} {poi_desc}'
				self.pretty_name += f'{"+" if self.shift > 0 else "-"}<{abs(int(self.shift))}h>'
			else:
				self.description = f'Value of {ser_desc} at the hour of {poi_desc}'
		elif 'coverage' == self.type:
			self.pretty_name = f'coverage [{series}]'
			self.description = f'Coverage percentage of {ser_desc} between onset and event end | next event | +{MAX_EVENT_LENGTH_H}h'
		elif 'time' in self.type:
			self.pretty_name = f"offset{'%' if '%' in self.type else ' '}[{poi}]"
			self.description = f'Time offset between event onset and {poi_desc}, ' + ('%' if '%' in self.type else 'hours')
		elif 'clone' == self.type:
			self.pretty_name = f"{self.series} of [{''.join([a[0].upper() for a in self.poi.split('_')])}{'+' if self.shift > 0 else '-'}{abs(int(self.shift))}]"
			self.description = 'Parameter cloned from other {self.poi}'
		else:
			self.pretty_name = f'{series} {self.type.split("_")[-1]}'
			self.description = ('Maximum' if 'max' in self.type else 'Minimum') + (' absolute' if 'abs' in self.type else '') +\
				f' value of {ser_desc} between onset and event end | next | +{MAX_EVENT_LENGTH_H}h'

with pool.connection() as conn:
	conn.execute('''CREATE TABLE IF NOT EXISTS events.generic_columns_info (
		id serial primary key,
		created timestamp with time zone not null default CURRENT_TIMESTAMP,
		last_computed timestamp with time zone,
		entity text not null,
		users smallint[],
		type text not null,
		series text not null default '',
		poi text not null default '',
		shift integer not null default 0,
		CONSTRAINT params UNIQUE (entity, type, series, poi, shift))''')
	path = Path(__file__, '../../config/tables_generics.json').resolve()
	with open(path) as file:
		preset_generics = json.load(file)
	for table in preset_generics:
		for generic in preset_generics[table]:
			conn.execute(f'''INSERT INTO events.generic_columns_info (entity,users,{",".join(generic.keys())})
				VALUES (%s,%s,{",".join(["%s" for i in generic])})
				ON CONFLICT ON CONSTRAINT params DO NOTHING''', [table, [-1]] + list(generic.values()))

	generics = [GenericColumn(*row) for row in conn.execute('SELECT * FROM events.generic_columns_info')]
	for generic in generics:	
		conn.execute(f'ALTER TABLE events.{generic.entity} ADD COLUMN IF NOT EXISTS {generic.name} REAL')

def _select_recursive(entity, target_entity=None, target_column=None):
	joins = ''
	if target_entity and entity != target_entity:
		def rec_find(a, b, path=[entity], direction=[1]):
			if a == b: return path, direction
			lst = tables_tree.get(a)
			for ent in lst or []:
				if ent in path: continue
				if p := rec_find(ent, b, path + [ent], direction+[1]):
					return p
			upper = next((t for t in tables_tree if a in tables_tree[t]), None)
			if not upper or upper in path: return None
			return rec_find(upper, b, path + [upper], direction+[-1])
		found = rec_find(entity, target_entity)
		if not found:
			raise ValueError('No path to entity')
		path, direction = found
		links = [[path[i], path[i+1], direction[i+1]] for i in range(len(path)-1)]
		for a, b, direction in links:
			master, slave = (a, b)[::direction]
			joins += f'LEFT JOIN events.{b} ON {slave}.id = {master}.{tables_refs.get((master, slave))}\n'

	query = [ (entity, 'id'), (target_entity, target_column) if target_column else (entity, 'time') ]
	if 'duration' in tables_info[entity] and not target_column:
		query.append((entity, 'duration'))
	if target_entity and not target_column:
		query.append((target_entity, 'time'))

	columns = ','.join([f'EXTRACT(EPOCH FROM {e}.time)' if 'time' in c else f'{e}.{c}' for e, c in query])
	select_query = f'SELECT {columns}\nFROM events.{entity}\n{joins}ORDER BY {entity}.time'
	with pool.connection() as conn:
		curs = conn.execute(select_query)
		res = np.array(curs.fetchall(), dtype='f8')
		duration = res[:,query.index((entity, 'duration'))] if (entity, 'duration') in query else None
		t_time = res[:,query.index((target_entity, 'time'))] if (target_entity, 'time') in query else None
		return res[:,0], res[:,1], duration, t_time

def select_generics(user_id=None):
	with pool.connection() as conn:
		where = '' if user_id is None else ' OR %s = ANY(users)'
		rows = conn.execute(f'SELECT * FROM events.generic_columns_info WHERE -1 = ANY(users){where} ORDER BY (series, type) DESC',
			[] if user_id is None else [user_id]).fetchall()
	result = [GenericColumn(*row) for row in rows]
	return result

def _select(t_from, t_to, series):
	interval = [int(i) for i in (t_from, t_to)]
	if SERIES[series][0] == 'omni':
		return omni.select(interval, [series])[0]
	else:
		return gsm.select(interval, series)[0]

def compute_generic(generic):
	try:
		t_start = time()
		log.info(f'Computing {generic.name}')
		if generic.type == 'clone':
			# FIXME: gently check if column exists
			event_id, target_value, _, _ = _select_recursive(generic.entity, generic.poi, generic.series)
			print(target_value)
			result = np.full_like(target_value, np.nan)
			shift = int(generic.shift)
			if shift > 0:
				result[:-shift] = target_value[shift:]
			else:
				result[-shift:] = target_value[:shift]
		else:
			target_entity = generic.poi if generic.poi in ENTITY_POI and generic.poi != generic.entity else None
			event_id, event_start, event_duration, target_time = _select_recursive(generic.entity, generic.poi) # 50 ms
			if generic.series:
				data_series = np.array(_select(event_start[0], event_start[-1] + MAX_EVENT_LENGTH, generic.series), dtype='f8') # 400 ms
				data_time, data_value = data_series[:,0], data_series[:,1]
			length = len(event_id)

			def get_event_windows(d_time):
				start_hour = np.floor(event_start / HOUR) * HOUR
				if event_duration is not None:
					slice_len = np.where(~np.isnan(event_duration), event_duration, MAX_EVENT_LENGTH_H).astype('i')
				else:
					bound_right = start_hour + MAX_EVENT_LENGTH
					to_next_event = np.empty(length, dtype='i8')
					to_next_event[:-1] = (start_hour[1:] - start_hour[:-1]) / HOUR
					to_next_event[-1] = 9999
					slice_len = np.minimum(to_next_event, MAX_EVENT_LENGTH_H)
				left = np.searchsorted(d_time, start_hour, side='left')
				slice_len[start_hour + slice_len*HOUR < d_time[0]] = 0 # eh
				return left, slice_len
			
			def find_extremum(typ, ser):
				is_max, is_abs = 'max' in typ, 'abs' in typ
				data = data_series if ser == generic.series else \
					np.array(_select(event_start[0], event_start[-1] + MAX_EVENT_LENGTH, ser), dtype='f8')
				d_time, value = data[:,0], data[:,1]
				result = np.full((length, 2), np.nan, dtype='f8')
				left, slice_len = get_event_windows(d_time)
				value = np.abs(value) if is_abs else value
				fn = lambda d: 0 if np.isnan(d).all() else (np.nanargmax(d) if is_max else np.nanargmin(d))
				if ser in ['A10', 'A10m']:
					for i in range(length):
						if slice_len[i] > 1:
							val = gsm.normalize_variation(value[left[i]:left[i]+slice_len[i]])
							idx = fn(val)
							result[i] = (d_time[idx], val[idx])
				else:
					idx = np.array([fn(value[left[i]:left[i]+slice_len[i]]) for i in range(length)])
					nonempty = np.where(slice_len > 0)[0]
					result[nonempty] = data[left + idx][nonempty]
				return result

			if generic.poi in ENTITY_POI:
				poi_time = event_start if generic.poi == generic.entity else target_time
			elif generic.poi in ['next', 'previous']:
				offset = 1 if generic.poi == 'next' else -1
				poi_time = np.full(length, np.nan)
				if generic.poi == 'next':
					poi_time[:-1] = event_start[1:]
				else:
					poi_time[1:] = event_start[:-1]
			elif generic.poi:
				typ, ser = parse_extremum_poi(generic.poi)
				poi_time = find_extremum(typ, ser)[:,0]

			if 'time_to' in generic.type:
				result = (poi_time - event_start) / HOUR
				if '%' in generic.type:
					result = result / event_duration * 100
			elif generic.type in EXTREMUM_TYPES:
				result = find_extremum(generic.type, generic.series)[:,1]
			elif generic.type == 'range':
				r_max = find_extremum('max', generic.series)[:,1]
				r_min = find_extremum('min', generic.series)[:,1]
				result = r_max - r_min
			elif generic.type == 'value':
				result = np.full(length, np.nan, dtype='f8')
				poi_hour = np.floor(poi_time / HOUR) * HOUR
				shift = generic.shift
				start_hour = (np.floor(poi_time / HOUR) + shift if shift <= 0 else np.ceil(poi_time / HOUR)) * HOUR
				window_len = max(1, abs(shift))
				per_hour = np.full((length, window_len), np.nan, dtype='f8')
				for h in range(window_len):
					_, a_idx, b_idx = np.intersect1d(start_hour + h*HOUR, data_time, return_indices=True)
					per_hour[a_idx, h] = data_value[b_idx]
				nan_threshold = np.floor(window_len / 2)
				filter_nan = np.count_nonzero(np.isnan(per_hour), axis=1) <= nan_threshold
				result[filter_nan] = np.nanmean(per_hour[filter_nan], axis=1)
			elif generic.type == 'coverage':
				left, slice_len = get_event_windows(data_time)
				result = np.array([np.count_nonzero(~np.isnan(data_value[left[i]:left[i]+slice_len[i]])) for i in range(length)]) / slice_len * 100
			else:
				assert False
			if generic.series == 'kp_index':
				result[result != None] /= 10
		data = np.column_stack((np.where(np.isnan(result), None, np.round(result, 2)), event_id.astype('i8'))).tolist() 
		# FIXME return COALESCE
		q = f'UPDATE events.{generic.entity} SET {generic.name} = %s WHERE {generic.entity}.id = %s'
		with pool.connection() as conn:
			conn.cursor().executemany(q, data)
			conn.execute('UPDATE events.generic_columns_info SET last_computed = CURRENT_TIMESTAMP WHERE id = %s', [generic.id])
		log.info(f'Computed {generic.name} in {round(time()-t_start,2)}s')
		return True
	except Exception as e:
		log.error(f'Failed at {generic.name}: {traceback.format_exc()}')
		return False

def recompute_generics(generics):
	if type(generics) != list:
		generics = [generics]
	with ThreadPoolExecutor(max_workers=4) as executor:
		res = executor.map(compute_generic, generics)
	return any(res)
		
def init_generics():
	with pool.connection() as conn:
		events = conn.execute('SELECT EXTRACT(EPOCH FROM time)::integer FROM events.forbush_effects ORDER BY time').fetchall()
	omni.ensure_prepared([events[0][0] - 24 * HOUR, events[-1][0] + 48 * HOUR])
	recompute_generics(select_generics())

def add_generic(uid, entity, series, gtype, poi, shift):
	if entity not in tables_info or not gtype:
		raise ValueError('Unknown entity')
	if entity not in ENTITY_POI:
		raise ValueError('Entity doesn\'t know time')
	if 'time' not in gtype and 'clone' != gtype and series not in SERIES:
		raise ValueError('Unknown series')
	if shift and abs(int(shift)) > MAX_EVENT_LENGTH_H:
		raise ValueError('Shift too large')

	if gtype in NO_POI_TYPES or poi in ENTITY_POI:
		poi_type, poi_series = poi, None
	elif gtype != 'clone': # underscore between parts is not checked hence identical generics can coexist (so what?)
		poi_type, poi_series = parse_extremum_poi(poi)
		if not poi_type or poi_series not in SERIES:
			raise ValueError('Could not parse poi')

	if gtype == 'value':
		pass
	elif 'clone' == gtype:
		if poi not in ENTITY_POI:
			raise ValueError('Not an entity POI')
		if not shift or shift == 0:
			raise ValueError('Shift should not be 0')
		generics = select_generics()
		if series not in tables_info[poi] and not next((g for g in generics if g.entity == poi and g.name == series), False):
			raise ValueError('Target column not found')
	elif 'coverage' == gtype:
		if poi or shift:
			raise ValueError('Coverage does not support poi/shift')
	elif 'time_to' in gtype:
		if series:
			raise ValueError('Time_to does not support series')
		if shift and poi not in ENTITY_POI:
			raise ValueError('Shift with extremum not supported')
		if '%' in gtype and 'duration' not in tables_info[entity]:
			raise ValueError('Time fractions not supported')
	elif gtype in NO_POI_TYPES:
		if poi or shift:
			raise ValueError('Extremum does not support poi/shift')
	else:
		raise ValueError('Unknown type')

	with pool.connection() as conn:
		row = conn.execute('INSERT INTO events.generic_columns_info AS tbl (users, entity, series, type, poi, shift) VALUES (%s,%s,%s,%s,%s,%s) ' +
			'ON CONFLICT ON CONSTRAINT params DO UPDATE SET users = array(select distinct unnest(tbl.users || %s)) RETURNING *',
			[[uid], entity, series or '', gtype, poi or '', int(shift) if shift else 0, uid]).fetchone()
		generic = GenericColumn(*row)
		conn.execute(f'ALTER TABLE events.{generic.entity} ADD COLUMN IF NOT EXISTS {generic.name} REAL')
	if len(generic.users) == 1:
		recompute_generics(generic)
	log.info(f'Generic added by user ({uid}): {entity}, {series}, {gtype}, {poi}, {shift}')
	return generic

def remove_generic(uid, gid):
	with pool.connection() as conn:
		row = conn.execute('UPDATE events.generic_columns_info SET users = array_remove(users, %s) WHERE id = %s RETURNING *', [uid, gid]).fetchone()
		if not row: return
		generic = GenericColumn(*row) 
		if not generic.users:
			conn.execute(f'DELETE FROM events.generic_columns_info WHERE id = {generic.id}')
			conn.execute(f'ALTER TABLE events.{generic.entity} DROP COLUMN IF EXISTS {generic.name}')
	log.info(f'Generic removed by user ({uid}): {generic.name} => {generic.users}')
		