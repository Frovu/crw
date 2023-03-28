from core.database import pg_conn, tables_info, tables_tree, tables_refs
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from math import floor, ceil
from concurrent.futures import ThreadPoolExecutor
import data_series.omni.database as omni
import data_series.gsm.database as gsm
import json, logging
import numpy as np
import psycopg2.extras

log = logging.getLogger('aides')

HOUR = 3600
MAX_EVENT_LENGTH_H = 48
MAX_EVENT_LENGTH = MAX_EVENT_LENGTH_H * HOUR
EXTREMUM_TYPES = ['min', 'max', 'abs_min', 'abs_max']
ENTITY_POI = [t for t in tables_info if 'time' in tables_info[t]]

SERIES = {
	"sw_speed": ["omni", "V"],
	"sw_density": ["omni", "D"],
	"sw_temp": ["omni", "T"],
	"temperature_idx": ["omni", "Tidx"],
	"imf_scalar": ["omni", "B"],
	"imf_x": ["omni", "Bx"],
	"imf_y": ["omni", "By"],
	"imf_z": ["omni", "Bz"],
	"plasma_beta": ["omni", "beta"],
	"dst_index": ["omni", "Dst"],
	"kp_index": ["omni", "Kp"],
	"ap_index": ["omni", "Ap"],
	"A10": ["gsm", "A10"],
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

	@classmethod
	def from_config(cls, desc):
		return cls(None, None, None, None, None, desc['type'], desc['series'], desc.get('poi'), desc.get('shift'))

	def __post_init__(self):
		name = f'g_{self.type}'
		if self.series: name += f'_{self.series}'
		if self.poi: name += f'_{self.poi}'
		if self.shift: name += f'_{abs(int(self.shift))}{"b" if self.shift < 0 else "a"}'
		self.name = name.lower()

		series = self.series and SERIES[self.series][1]
		if 'abs' in self.type:
			series = f'abs({series})'
		if self.poi in ENTITY_POI:
			poi = 'ons' if self.poi == self.entity else ''.join([a[0].upper() for a in self.poi.split('_')])
		elif self.poi:
			typ, ser = parse_extremum_poi(self.poi)
			ser = SERIES[ser][1]
			poi = typ.split('_')[-1] + ' ' + (f'abs({ser})' if 'abs' in typ else ser)
		if self.type == 'value':
			self.pretty_name = f'{series} [{poi}]'
			if self.shift and self.shift != 0:
				self.pretty_name += f'{"+" if self.shift > 0 else "-"}<{abs(int(self.shift))}h>'
		elif 'time' in self.type:
			self.pretty_name = f'offset [{poi}]'
		else:
			self.pretty_name = f'{series} {self.type.split("_")[-1]}'

def _init():
	with pg_conn.cursor() as cursor:
		cursor.execute('''CREATE TABLE IF NOT EXISTS events.generic_columns_info (
			id serial primary key,
			created timestamp with time zone not null default CURRENT_TIMESTAMP,
			last_computed timestamp with time zone,
			entity text not null,
			users integer[],
			type text not null,
			series text not null default '',
			poi text not null default '',
			shift integer not null default 0,
			CONSTRAINT params UNIQUE (entity, type, series, poi, shift))''')
		path = Path(__file__, '../../config/tables_generics.json').resolve()
		with open(path) as file:
			generics = json.load(file)
		for table in generics:
			for generic in generics[table]:
				cursor.execute(f'''INSERT INTO events.generic_columns_info (entity,users,{",".join(generic.keys())})
					VALUES (%s,%s,{",".join(["%s" for i in generic])})
					ON CONFLICT ON CONSTRAINT params DO NOTHING''', [table, [-1]] + list(generic.values()))
				col_name = GenericColumn.from_config(generic).name
				cursor.execute(f'ALTER TABLE events.{table} ADD COLUMN IF NOT EXISTS {col_name} REAL')
		pg_conn.commit()
_init()

def _select_recursive(entity, target_entity=None):
	joins = ''
	if target_entity:
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

	query = [ (entity, 'id'), (entity, 'time') ]
	if 'duration' in tables_info[entity]:
		query.append((entity, 'duration'))
	if target_entity:
		query.append((target_entity, 'time'))

	columns = ','.join([f'EXTRACT(EPOCH FROM {e}.time)' if 'time' in c else f'{e}.{c}' for e, c in query])
	select_query = f'SELECT {columns}\nFROM events.{entity}\n{joins}ORDER BY {entity}.time'
	with pg_conn.cursor() as cursor:
		cursor.execute(select_query)
		res = np.array(cursor.fetchall(), dtype='f')
		duration = res[:,query.index((entity, 'duration'))] if (entity, 'duration') in query else None
		t_time = res[:,query.index((target_entity, 'time'))] if (target_entity, 'time') in query else None
		return res[:,0], res[:,1], duration, t_time

def select_generics(user_id=None):
	with pg_conn.cursor() as cursor:
		where = '' if user_id is None else ' OR %s = ANY(users)'
		cursor.execute(f'SELECT * FROM events.generic_columns_info WHERE -1 = ANY(users){where} ORDER BY id',[] if user_id is None else [user_id])
		rows = cursor.fetchall()
	result = [GenericColumn(*row) for row in rows]
	return result

def _select(t_from, t_to, series):
	if SERIES[series][0] == 'omni':
		return omni.select([t_from, t_to], [series])[0]
	else:
		return gsm.select([t_from, t_to], series)[0]

def compute_generic(generic):
	log.info(f'Computing {generic.name} for {generic.entity}')
	target_entity = generic.poi if generic.poi in ENTITY_POI and generic.poi != generic.entity else None
	event_id, event_start, event_duration, target_time  = _select_recursive(generic.entity, target_entity)
	data_series = generic.series and np.array(_select(event_start[0], event_start[-1] + MAX_EVENT_LENGTH, generic.series), dtype='f')
	length = len(event_id)
	start_hour = np.floor(event_start / HOUR) * HOUR
	
	def find_extremum(typ, ser):
		is_max, is_abs = 'max' in typ, 'abs' in typ
		data = data_series if ser == generic.series else \
			np.array(_select(event_start[0], event_start[-1] + MAX_EVENT_LENGTH, ser), dtype='f')
		result = np.full((len(data), 2), np.nan, dtype='f')
		for i in range(length):
			bound_right = start_hour[i] + MAX_EVENT_LENGTH
			if i < length - 1:
				bound_event = start_hour[i+1] - HOUR
				bound_right = min(bound_right, bound_event)
			data_slice = data[data[:,0] >= start_hour[0]][data[:,0] <= bound_right]
			if not len(data_slice) or np.isnan(data_slice).all():
				continue
			target = np.abs(data_slice[:,1]) if is_abs else data_slice[:,1]
			idx = np.nanargmax(target) if is_max else np.nanargmin(target)
			result[i] = data_slice[idx]
		return result

	if generic.poi in ENTITY_POI:
		poi_time = event_start if generic.poi == generic.entity else target_time
	elif generic.poi:
		typ, ser = parse_extremum_poi(generic.poi)
		poi_time = find_extremum(typ, ser)[:,0]

	if 'time_to' in generic.type:
		result = (poi_time - event_start) / HOUR
		if '%' in generic.type:
			result = result / event_duration * 100
	elif generic.type == 'value':
		def compute(i):
			if generic.poi != generic.entity:
				assert False
			hour0 = start_hour[i]
			if generic.shift == 0:
				res = _select(hour0, hour0, generic.series)
			else:
				t_1 = hour0 - HOUR if generic.shift < 0 else ceil(events[i][1] / HOUR) * HOUR
				t_2 = hour0 + generic.shift * HOUR # for offset +1 00:00 will fetch 00:00-01:00 (2h)
				res = _select(min(t_1, t_2), max(t_1, t_2), generic.series)
			if not len(res):
				return None
			data = np.array(res, dtype=np.float64)[:,1]
			if np.isnan(data).all():
				return None
			return np.nanmean(data)
	elif generic.type in EXTREMUM_TYPES:
		def compute(i):
			pass
	else:
		assert False
	
	if generic.series == 'kp_index':
		result[result != None] /= 10

	q = f'UPDATE events.{generic.entity} SET {generic.name} = data.val FROM (VALUES %s) AS data (id, val) WHERE {generic.entity}.id = data.id'
	with pg_conn.cursor() as cursor:
		psycopg2.extras.execute_values(cursor, q, np.column_stack((event_id, result)).tolist(), template='(%s, %s)')
		cursor.execute('UPDATE events.generic_columns_info SET last_computed = CURRENT_TIMESTAMP WHERE id = %s', [generic.id])
	pg_conn.commit()
	log.info(f'Computed {generic.name} for {generic.entity}')

def compute_generics(generics: [GenericColumn]):
	with ThreadPoolExecutor() as executor:
		for generic in generics:
			executor.submit(compute_generic, generic)
	pg_conn.commit()
		
def init_generics():
	with pg_conn.cursor() as cursor:
		cursor.execute('SELECT EXTRACT(EPOCH FROM time) FROM events.forbush_effects ORDER BY time')
		events = cursor.fetchall()
	omni.ensure_prepared([events[0][0] - 24 * HOUR, events[-1][0] + 48 * HOUR])
	compute_generics(select_generics())

def add_generic(uid, entity, series, gtype, poi, shift):
	if entity not in tables_info:
		raise ValueError('Unknown entity')
	if 'time' not in gtype and series not in SERIES:
		raise ValueError('Unknown series')
	if shift and abs(int(shift)) > MAX_EVENT_LENGTH_H:
		raise ValueError('Shift too large')

	if gtype in EXTREMUM_TYPES or poi in ENTITY_POI:
		poi_type, poi_series = poi, None
	else: # underscore between parts is not checked hence identical generics can coexist (so what?)
		poi_type, poi_series = parse_extremum_poi(poi)
		if not poi_type or poi_series not in SERIES:
			raise ValueError('Could not parse poi')

	if gtype == 'value':
		pass
	elif 'time_to' in gtype:
		if series or shift:
			raise ValueError('Time_to does not support series/shift')
		if '%' in gtype and 'duration' not in tables_info[entity]:
			raise ValueError('Time fractions not supported')
	elif gtype in EXTREMUM_TYPES:
		if poi or shift:
			raise ValueError('Extremum does not support poi/shift')
	else:
		raise ValueError('Unknown type')
	with pg_conn.cursor() as cursor:
		cursor.execute('INSERT INTO events.generic_columns_info AS tbl (users, entity, series, type, poi, shift) VALUES (%s,%s,%s,%s,%s,%s) ' +
			'ON CONFLICT ON CONSTRAINT params DO UPDATE SET users = array(select distinct unnest(tbl.users || %s)) RETURNING *',
			[[uid], entity, series or '', gtype, poi or '', shift or 0, uid])
		generic = GenericColumn(*cursor.fetchone())
		cursor.execute(f'ALTER TABLE events.{generic.entity} ADD COLUMN IF NOT EXISTS {generic.name} REAL')
		compute_generic(generic)
	pg_conn.commit()
	log.info(f'Generic added by user ({uid}): {entity}, {series}, {gtype}, {poi}, {shift}')
	return generic

def remove_generic(uid, gid):
	with pg_conn.cursor() as cursor:
		cursor.execute('UPDATE events.generic_columns_info SET users = array_remove(users, %s) WHERE id = %s RETURNING *', [uid, gid])
		res = cursor.fetchone()
		if not res: return
		generic = GenericColumn(*res)
		if not generic.users:
			cursor.execute(f'DELETE FROM events.generic_columns_info WHERE id = {generic.id}')
			cursor.execute(f'ALTER TABLE events.{generic.entity} DROP COLUMN IF EXISTS {generic.name}')
	pg_conn.commit()
	log.info(f'Generic removed by user ({uid}): #{gid}')
		