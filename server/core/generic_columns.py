from core.database import log, pool, upsert_many, tables_info, tables_tree, tables_refs, get_joins_path, ENTITY_SHORT
from dataclasses import dataclass
from datetime import datetime
from time import time
from pathlib import Path
from math import floor, ceil
from concurrent.futures import ThreadPoolExecutor
import data_series.omni.database as omni
import data_series.gsm.database as gsm
import json, traceback
import numpy as np

HOUR = 3600
MAX_EVENT_LENGTH_H = 72
MAX_EVENT_LENGTH = MAX_EVENT_LENGTH_H * HOUR
EXTREMUM_TYPES = ['min', 'max', 'abs_min', 'abs_max']
GENERIC_TYPES = EXTREMUM_TYPES + ['range', 'mean', 'median', 'value', 'avg_value', 'time_to_%', 'time_to', 'coverage', 'clone', 'diff', 'abs_diff']
DERIVED_TYPES = ['clone', 'diff', 'abs_diff']

ENTITY = [t for t in tables_info if 'time' in tables_info[t]]
ENTITY_WITH_DURATION = [t for t in ENTITY if 'duration' in tables_info[t]]
ENTITY_POI = ENTITY + ['end_' + t for t in ENTITY_WITH_DURATION]

SERIES = { # order matters (no it does not)
	'v_sw': ['omni', 'sw_speed', 'V'],
	'd_sw': ['omni', 'sw_density', 'D'],
	't_sw': ['omni', 'sw_temperature', 'T'],
	't_idx': ['omni', 'temperature_idx', 'Tidx'],
	'imf': ['omni', 'imf_scalar', 'B'],
	'bx': ['omni', 'imf_x', 'Bx'],
	'by': ['omni', 'imf_y', 'By'],
	'bz': ['omni', 'imf_z', 'Bz'],
	'by_gsm': ['omni', 'imf_y_gsm', 'By_gsm'],
	'bz_gsm': ['omni', 'imf_z_gsm', 'Bz_gsm'],
	'beta': ['omni', 'plasma_beta', 'beta'],
	'dst': ['omni', 'dst_index', 'Dst'],
	'kp': ['omni', 'kp_index', 'Kp'],
	'ap': ['omni', 'ap_index', 'Ap'],
	'a10m': ['gsm', 'a10m', 'A0m'],
	'a10': ['gsm', 'a10', 'A0'],
	'axy': ['gsm', 'axy', 'Axy'], 
	'phi_axy': ['gsm', 'phi_axy', 'φ(Axy)'],
	'ax': ['gsm', 'ax', 'Ax'],
	'ay': ['gsm', 'ay', 'Ay'],
	'az': ['gsm', 'az', 'Az'],
}
SERIES = {**SERIES, **{'$d_'+s: [d[0], d[1], f'δ({d[2]})'] for s, d in SERIES.items() }}

def parse_extremum_poi(poi):
	poi_type = next((e for e in EXTREMUM_TYPES if poi.startswith(e)), None)
	poi_series = poi_type and poi[len(poi_type)+1:]
	return poi_type, poi_series
def short_entity_name(name):
	return ''.join([a[0].upper() for a in name.split('_')])
def shift_indicator(shift):
	return f"{'+' if shift > 0 else '-'}{abs(int(shift))}" if shift != 0 else ''

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
	description: str = None
	data_type: str = 'real'

	@classmethod
	def info_from_name(cls, name, entity):
		try:
			if not name.startswith('g__'):
				found = tables_info[entity][name]
				return found.get('name', name), found.get('type', 'real')
			found = ALL_GENERICS[int(name[3:])]
		except:
			log.warn('Could not find generic target column: ' + name)
			return '<DELETED>', 'real'
		return found.pretty_name, found.data_type

	def __post_init__(self):
		self.name = f'g__{self.id}'

		series, poi = self.series and self.type not in DERIVED_TYPES and SERIES[self.series][2], ''
		if 'abs' in self.type:
			series = f'abs({series})'
		if self.poi in ENTITY_POI:
			poi = ENTITY_SHORT[self.poi.replace('end_', '')].upper() + (' end' if 'end_' in self.poi else '')
		elif self.poi and self.type not in DERIVED_TYPES:
			typ, ser = parse_extremum_poi(self.poi)
			ser = SERIES[ser][2]
			poi = typ.split('_')[-1] + ' ' + (f'abs({ser})' if 'abs' in typ else ser)
		poi_h = poi and poi + shift_indicator(self.shift) + ('h' if self.shift else '')

		ser_desc = series and self.type not in DERIVED_TYPES and f'{SERIES[self.series][0]}({self.series})'
		poi_desc = poi if self.poi != self.entity else "event onset"
		if self.type in ['avg_value', 'value']:
			self.pretty_name = f'{series} [{"ons" if self.poi == self.entity else poi}]'
			if self.shift and self.shift != 0:
				if abs(self.shift) == 1:
					self.description = f'Value of {ser_desc} one hour {"before" if self.shift<0 else "after"} {poi_desc}'
				else:
					what = 'averaged over ' if 'avg' in self.type else ''
					self.description = f'Value of {ser_desc} {what}{abs(self.shift)} hours {"before" if self.shift<0 else "after"} {poi_desc}'
				self.pretty_name += '+' if self.shift > 0 else '-'
				self.pretty_name += f'<{abs(self.shift)}h>' if 'avg' in self.type else f'{abs(self.shift)}h'
			else:
				self.description = f'Value of {ser_desc} at the hour of {poi_desc}'
		elif 'time' in self.type:
			shift = f"{shift_indicator(self.shift)}" if self.shift != 0 else ''
			self.pretty_name = f"offset{'%' if '%' in self.type else ' '}[{poi}{shift}]"
			self.description = f'Time offset between event onset and {poi_desc}, ' + ('%' if '%' in self.type else 'hours')
		elif 'diff' in self.type:
			pretty, gtype1 = GenericColumn.info_from_name(self.series, self.entity)
			pretty2, gtype2 = GenericColumn.info_from_name(self.poi, self.entity)
			if gtype1 not in ['real', 'integer'] or gtype2 not in ['real', 'integer']:
				raise ValueError('Not a number type')
			name = f'{pretty} - {pretty2}'
			self.pretty_name = f'|{name}|' if 'abs' in self.type else f'({name})'
			self.description = f'Column values {"absolute" if "abs" in self.type else " "}difference'
		elif 'clone' == self.type:
			pretty, dtype = GenericColumn.info_from_name(self.series, self.poi)
			self.data_type = dtype
			self.pretty_name = f"[{poi}{shift_indicator(self.shift)}] {pretty}"
			self.description = f'Parameter cloned from associated {self.poi[:-1]} of other event'
		else:
			if 'coverage' == self.type:
				self.pretty_name = f'coverage [{series}]' + (f' to {poi_h}' if poi else '')
				self.description = f'Coverage percentage of {ser_desc}'
			else:
				self.pretty_name = f'{series} {self.type.split("_")[-1]}' + (f' [to {poi_h}]' if poi else '')
				if 'range' == self.type:
					self.description = f'Range of values of {ser_desc}'
				else:
					name = self.type.split('_')[-1]
					name = next((n for n in ['Maximum', 'Minimum', 'Mean', 'Median'] if name in n.lower()))
					self.description = name + (' absolute' if 'abs' in self.type else '') + f' value of {ser_desc}'
			event = ENTITY_SHORT[self.entity].upper()
			if self.entity in ENTITY_WITH_DURATION:
				self.description += ' inside ' + event
			else:
				self.description += f' between {event} start and ' + (poi_h if poi else f'{event} end | next {event} | +{MAX_EVENT_LENGTH_H}h')

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
	ALL_GENERICS = dict() # except preset ones ofc
	for row in conn.execute('SELECT * FROM events.generic_columns_info'):
		ALL_GENERICS[row[0]] = GenericColumn(*row)
		# except:
		# 	conn.execute('DELETE FROM events.generic_columns_info WHERE id = %s', [row[0]])
		# 	log.warn(f'Failed to understand generic, deleting: {row}')
	for generic in ALL_GENERICS.values():
		conn.execute(f'ALTER TABLE events.{generic.entity} ADD COLUMN IF NOT EXISTS {generic.name} {generic.data_type}')
	PRESET_GENERICS = dict()
	for table in tables_info:
		for name, column_desc in tables_info[table].items():
			if name.startswith('_'): continue
			if g_desc := column_desc.get('generic'):
				generic = GenericColumn(None, None, None, table, [], g_desc['type'], g_desc.get('series', ''), g_desc.get('poi', ''),  g_desc.get('shift', 0))
				column_desc['name'] = column_desc.get('name', generic.pretty_name)
				column_desc['description'] = column_desc.get('description', generic.description)
				PRESET_GENERICS[name] = generic
	
def _select_recursive(entity, target_entity=None, target_column=None, dtype='f8'):
	joins = get_joins_path(entity, target_entity) if target_entity else ''
	query = [ (entity, 'id'), (target_entity, target_column) if target_column else (entity, 'time') ]
	if 'duration' in tables_info[entity] and not target_column:
		query.append((entity, 'duration'))
	if target_entity and not target_column:
		query.append((target_entity, 'time'))
	if target_entity and not target_column and 'duration' in tables_info[target_entity]:
		query.append((target_entity, 'duration'))
	columns = ','.join([f'EXTRACT(EPOCH FROM {e}.time)' if 'time' == c else f'{e}.{c}' for e, c in query])
	select_query = f'SELECT {columns}\nFROM events.{entity}\n{joins}ORDER BY {entity}.time'
	with pool.connection() as conn:
		curs = conn.execute(select_query)
		res = np.array(curs.fetchall(), dtype=dtype)
		duration = res[:,query.index((entity, 'duration'))] if (entity, 'duration') in query else None
		t_time = res[:,query.index((target_entity, 'time'))] if (target_entity, 'time') in query else None
		t_dur = res[:,query.index((target_entity, 'duration'))] if (target_entity, 'duration') in query else None
		return res[:,0], res[:,1], duration, t_time, t_dur

def select_generics(user_id=None):
	with pool.connection() as conn:
		where = '' if user_id is None else ' OR %s = ANY(users)'
		rows = conn.execute(f'SELECT * FROM events.generic_columns_info WHERE -1 = ANY(users){where} ORDER BY (series, type) DESC',
			[] if user_id is None else [user_id]).fetchall()
	result = [GenericColumn(*row) for row in rows]
	return result

def _select(t_from, t_to, series):
	interval = [int(i) for i in (t_from, t_to)]
	source, name, _ = SERIES[series]
	if source == 'omni':
		return omni.select(interval, [name])[0]
	else:
		return gsm.select(interval, [name])[0]

def apply_shift(a, shift, stub=np.nan):
	if shift == 0:
		return a
	res = np.full_like(a, stub)
	if shift > 0:
		res[:-shift] = a[shift:]
	else:
		res[-shift:] = a[:shift]
	return res

def apply_changes(d_ids, d_values, entity, column, conn):
	changes = conn.execute('SELECT * FROM (SELECT DISTINCT ON (event_id) event_id, new_value FROM events.changes_log ' + 
		' WHERE entity_name = %s AND column_name = %s ORDER BY event_id, time DESC) chgs WHERE new_value IS NULL OR new_value != \'auto\'', [entity, column]).fetchall()
	if len(changes):
		changes = np.array(changes, dtype='object')
		ids = changes[:,0]
		parsed = np.array([v and float(v) for v in changes[:,1]]) # presumes that only dtype=real generics are modifiable
		_, a_idx, b_idx = np.intersect1d(ids, d_ids, return_indices=True)
		d_values[b_idx] = parsed[a_idx]
		log.info(f'Applied {b_idx.size}/{len(changes)} overriding changes to {entity}.{column}')

# all data is presumed to be continuos
def compute_generic(generic, col_name=None):
	try:
		column = col_name or generic.name
		t_start = time()
		log.info(f'Computing {column}')
		if generic.type in ['diff', 'abs_diff']:
			event_id, value_0, _,_,_ = _select_recursive(generic.entity, generic.entity, generic.series)
			_, value_1, _,_,_ = _select_recursive(generic.entity, generic.entity, generic.poi)
			result = value_0 - value_1
			if 'abs' in generic.type:
				result = np.abs(result)
			data = np.column_stack((np.where(np.isnan(result), None, result), event_id.astype('i8')))

		elif generic.type == 'clone':
			event_id, target_value, _,_,_ = _select_recursive(generic.entity, generic.poi, generic.series, 'object')
			result = apply_shift(target_value, generic.shift, stub=None)
			data = np.column_stack((result, event_id.astype(int)))

		else:
			is_self_poi = generic.poi.endswith(generic.entity)
			target_entity = generic.poi.replace('end_', '') if generic.poi in ENTITY_POI and not is_self_poi else None
			event_id, event_start, event_duration, target_time, target_duration = _select_recursive(generic.entity, target_entity) # 50 ms
			if generic.series:
				actual_series = generic.series[3:] if generic.series.startswith('$d_') else generic.series
				data_series = np.array(_select(event_start[0], event_start[-1] + MAX_EVENT_LENGTH, actual_series), dtype='f8') # 400 ms
				data_time, data_value = data_series[:,0], data_series[:,1]
			else: data_series = None
			length = len(event_id)

			def apply_delta(data, series):
				if not data.size or not series.startswith('$d_'): return data
				delta = np.empty_like(data)
				delta[1:] = data[1:] - data[:-1]
				delta[0] = np.nan
				return delta
	
			def get_event_windows(d_time, ser):
				start_hour = np.floor(event_start / HOUR) * HOUR
				if event_duration is not None: # presumes events with explicit duration can't overlap
					slice_len = np.where(~np.isnan(event_duration), event_duration, MAX_EVENT_LENGTH_H).astype('i')
				else:
					bound_right = start_hour + MAX_EVENT_LENGTH
					to_next_event = np.empty(length, dtype='i8')
					to_next_event[:-1] = (start_hour[1:] - start_hour[:-1]) / HOUR
					to_next_event[-1] = 9999
					slice_len = np.minimum(to_next_event, MAX_EVENT_LENGTH_H)
				left = np.searchsorted(d_time, start_hour, side='left')
				if ser in ['a10', 'a10m']:
					left = np.maximum(left - 2, 0) # pick two hours before onset for CR density
					slice_len += 2
				slice_len[np.logical_or(start_hour < d_time[0], start_hour > d_time[-1])] = 0 # eh
				return left, slice_len

			def get_poi_windows(d_time, poi_time):
				p_time = poi_time - generic.shift * HOUR
				left_hour = np.floor(np.minimum(event_start, p_time) / HOUR) * HOUR
				rigth_time = np.maximum(event_start, p_time)
				slice_len = np.floor((rigth_time - left_hour) / HOUR)
				left = np.searchsorted(d_time, left_hour, side='left')
				slice_len[np.logical_or(left_hour < d_time[0], left_hour > d_time[-1])] = 0 # eh
				return left, np.where(np.isnan(slice_len), 0, slice_len).astype('i8')
			
			def find_extremum(typ, ser, left, slice_len, data=data_series):
				is_max, is_abs = 'max' in typ, 'abs' in typ
				d_time, value = data[:,0], data[:,1]
				result = np.full((length, 2), np.nan, dtype='f8')
				value = np.abs(value) if is_abs else value
				fn = lambda d: 0 if np.isnan(d).all() else (np.nanargmax(d) if is_max else np.nanargmin(d))
				if ser in ['a10', 'a10m']:
					for i in range(length):
						if slice_len[i] > 1:
							window = value[left[i]:left[i]+slice_len[i]]
							val = gsm.normalize_variation(window, with_trend=True)
							val = apply_delta(val, ser)
							idx = fn(val)
							result[i] = (d_time[left[i] + idx], val[idx])
				else:
					value = apply_delta(value, ser)
					idx = np.array([fn(value[left[i]:left[i]+slice_len[i]]) for i in range(length)])
					nonempty = np.where(slice_len > 0)[0]
					didx = left[nonempty] + idx[nonempty]
					result[nonempty] = np.column_stack((d_time[didx], value[didx]))
				return result

			# compute poi time if poi present
			if generic.poi in ENTITY_POI:
				poi_time = event_start if is_self_poi else target_time
				if generic.poi.startswith('end'):
					poi_time += (event_duration if is_self_poi else target_duration) * HOUR
				left, slice_len = None, None
			elif generic.poi:
				typ, ser = parse_extremum_poi(generic.poi)
				data = data_series if ser == generic.series else \
					np.array(_select(event_start[0], event_start[-1] + MAX_EVENT_LENGTH, ser[3:] if ser.startswith('$d_') else ser), dtype='f8')
				left, slice_len = get_event_windows(data[:,0], ser)
				poi_time = find_extremum(typ, ser, left, slice_len, data)[:,0]

			# compute target windows if needed
			if 'time_to' not in generic.type and 'value' not in generic.type:
				if generic.poi:
					target_left, target_slen = get_poi_windows(data_time, poi_time)
				else:
					target_left, target_slen = get_event_windows(data_time, generic.series)

			if 'time_to' in generic.type:
				shift = generic.shift
				s_poi_time = apply_shift(poi_time, shift)
				result = (s_poi_time - event_start) / HOUR
				if '%' in generic.type:
					result = result / event_duration * 100
			elif generic.type in EXTREMUM_TYPES:
				result = find_extremum(generic.type, generic.series, target_left, target_slen)[:,1]
			elif generic.type in ['mean', 'median']:
				result = np.full(length, np.nan, dtype='f8')
				fn = np.nanmean if generic.type == 'mean' else np.nanmedian
				for i in range(length):
					if target_slen[i] < 1: continue
					window = data_value[target_left[i]:target_left[i]+target_slen[i]]
					result[i] = fn(window)
			elif generic.type == 'range':
				r_max = find_extremum('max', generic.series, target_left, target_slen)[:,1]
				r_min = find_extremum('min', generic.series, target_left, target_slen)[:,1]
				result = r_max - r_min
			elif generic.type == 'coverage':
				result = np.full(length, np.nan, dtype='f8')
				for i in range(length):
					if target_slen[i] < 1: continue
					window = data_value[target_left[i]:target_left[i]+target_slen[i]]
					result[i] = np.count_nonzero(~np.isnan(window)) / target_slen[i] * 100
			elif generic.type in ['value', 'avg_value']:
				result = np.full(length, np.nan, dtype='f8')
				shift = generic.shift
				poi_hour = (np.floor(poi_time / HOUR) if shift <= 0 else np.ceil(poi_time / HOUR)) * HOUR
				start_hour = poi_hour + shift*HOUR if shift <= 0 else poi_hour
				window_len = max(1, abs(shift)) if 'avg' in generic.type else 1
				per_hour = np.full((length, window_len), np.nan, dtype='f8')
				if generic.series in ['a10', 'a10m']:
					ev_left, slice_len = get_event_windows(data_time, generic.series)
					diff_lft = np.minimum(0, (start_hour - data_time[ev_left]) / HOUR).astype(np.int32)
					diff_rgt = np.maximum(0, (start_hour - data_time[ev_left+slice_len]) / HOUR + window_len - 1).astype(np.int32)
					left = ev_left + diff_lft
					slice_len[slice_len > 0] += diff_rgt[slice_len > 0]
					window_offset = np.int32((data_time[ev_left] - start_hour) / HOUR)
					for i in range(length):
						sl = slice_len[i]
						if not sl: continue
						window = data_value[left[i]:left[i]+sl]
						times  = data_time[left[i]:left[i]+sl]
						idx = window_offset[i]
						if len(window) < window_len + idx: continue
						values = gsm.normalize_variation(window, with_trend=True)
						values = apply_delta(values, generic.series)
						wslice = values[idx:idx+window_len]
						per_hour[i,] = values[idx:idx+window_len]
						# if datetime.utcfromtimestamp(event_start[i]) == datetime(1991,10,28,15,37,0):
				else:
					data_value = apply_delta(data_value, generic.series)
					for h in range(window_len):
						_, a_idx, b_idx = np.intersect1d(start_hour + h*HOUR, data_time, return_indices=True)
						per_hour[a_idx, h] = data_value[b_idx]
				nan_threshold = np.floor(window_len / 2)
				filter_nan = np.count_nonzero(np.isnan(per_hour), axis=1) <= nan_threshold
				result[filter_nan] = np.nanmean(per_hour[filter_nan], axis=1)
			else:
				assert False

			if generic.series == 'kp_index':
				result[result != None] /= 10
			rounding = 1 if 'time_to' in generic.type or 'coverage' == generic.type else 2
			data = np.column_stack((np.where(np.isnan(result), None, np.round(result, rounding)), event_id.astype('i8')))

		# FIXME return COALESCE
		update_q = f'UPDATE events.{generic.entity} SET {column} = %s WHERE {generic.entity}.id = %s'
		with pool.connection() as conn:
			apply_changes(data[:,1], data[:,0], generic.entity, column, conn)
			conn.cursor().executemany(update_q, data.tolist())
			conn.execute('UPDATE events.generic_columns_info SET last_computed = CURRENT_TIMESTAMP WHERE id = %s', [generic.id])
		log.info(f'Computed {column} in {round(time()-t_start,2)}s')
		return True
	except Exception as e:
		log.error(f'Failed at {column}: {traceback.format_exc()}')
		return False

def recompute_generics(generics, columns=None):
	if type(generics) != list:
		generics = [generics]
	with ThreadPoolExecutor(max_workers=4) as executor:
		res = executor.map(compute_generic, generics, columns) if columns else executor.map(compute_generic, generics)
	return any(res)
		
def compute_default_generics():
	with pool.connection() as conn:
		first = conn.execute('SELECT EXTRACT(EPOCH FROM time)::integer FROM events.forbush_effects ORDER BY time LIMIT 1').fetchone()[0]
		last = conn.execute('SELECT EXTRACT(EPOCH FROM time)::integer FROM events.forbush_effects ORDER BY time DESC LIMIT 1').fetchone()[0]
	omni.ensure_prepared([first - 24 * HOUR, last + 48 * HOUR])
	recompute_generics(list(PRESET_GENERICS.values()), PRESET_GENERICS.keys())

def add_generic(uid, entity, series, gtype, poi, shift):
	if entity not in tables_info or not gtype:
		raise ValueError('Unknown entity')
	if entity not in ENTITY:
		raise ValueError('Entity doesn\'t know time')
	if 'time' not in gtype and gtype not in DERIVED_TYPES and series not in SERIES:
		raise ValueError('Unknown series')
	if shift and abs(int(shift)) > MAX_EVENT_LENGTH_H:
		raise ValueError('Shift too large')

	if poi and poi not in ENTITY_POI and 'diff' not in gtype: # underscore between parts is not checked hence identical generics can coexist (so what?) (I already dont get it ~7 days after..)
		poi_type, poi_series = parse_extremum_poi(poi)
		if not poi_type or poi_series not in SERIES:
			raise ValueError('Could not parse poi')
	if poi == 'end_' + entity:
		poi = None
	if poi == entity and not shift and 'value' not in gtype:
		raise ValueError('Always empty window')
	if not poi and shift:
		raise ValueError('Shift without POI')

	if 'value' in gtype:
		if not poi:
			raise ValueError('POI is required')
	elif gtype in ['diff', 'abs_diff']:
		if shift:
			raise ValueError('Shift not supported')
		generics = select_generics(uid)
		if series not in tables_info[entity] and not next((g for g in generics if g.entity == entity and g.name == series), False):
			raise ValueError('Column 1 not found')
		if poi not in tables_info[entity] and not next((g for g in generics if g.entity == entity and g.name == poi), False):
			raise ValueError('Column 2 not found')
		if len(series) + len(poi) + len(gtype) > 60:
			raise ValueError('Reached underworld')
	elif 'clone' == gtype:
		if poi not in ENTITY:
			raise ValueError('Not an entity POI')
		# if not shift or shift == 0:
		# 	raise ValueError('Shift should not be 0')
		if len(series) >= 48:
			raise ValueError('Max clone depth reached')
		generics = select_generics(uid)
		if series not in tables_info[poi] and not next((g for g in generics if g.entity == poi and g.name == series), False):
			raise ValueError('Target column not found')
	elif 'time_to' in gtype:
		if not poi:
			raise ValueError('POI is required')
		if series:
			raise ValueError('Time_to does not support series')
		if shift and poi not in ENTITY_POI:
			raise ValueError('Shift with extremum not supported')
		if '%' in gtype and 'duration' not in tables_info[entity]:
			raise ValueError('Time fractions not supported')
	elif gtype in EXTREMUM_TYPES:
		if 'abs' in gtype and series in ['a10', 'a10m']:
			raise ValueError('Absolute variation is nonsense')
	elif gtype not in GENERIC_TYPES:
		raise ValueError('Unknown type')

	with pool.connection() as conn:
		row = conn.execute('INSERT INTO events.generic_columns_info AS tbl (users, entity, series, type, poi, shift) VALUES (%s,%s,%s,%s,%s,%s) ' +
			'ON CONFLICT ON CONSTRAINT params DO UPDATE SET users = array(select distinct unnest(tbl.users || %s)) RETURNING *',
			[[uid], entity, series or '', gtype, poi or '', int(shift) if shift else 0, uid]).fetchone()
		generic = GenericColumn(*row)
		if next((g for g in PRESET_GENERICS.values() if g.entity == entity and g.name == generic.name), None):
			conn.rollback()
			raise ValueError('Column exists')
		ALL_GENERICS[row[0]] = generic
		conn.execute(f'ALTER TABLE events.{generic.entity} ADD COLUMN IF NOT EXISTS {generic.name} {generic.data_type}')
	if len(generic.users) == 1:
		recompute_generics(generic)
	log.info(f'Generic added by user ({uid}): {generic.pretty_name} ({generic.entity})')
	return generic

def remove_generic(uid, gid):
	with pool.connection() as conn:
		row = conn.execute('UPDATE events.generic_columns_info SET users = array_remove(users, %s) WHERE id = %s RETURNING *', [uid, gid]).fetchone()
		if not row: return
		generic = GenericColumn(*row) 
		if not generic.users:
			conn.execute(f'DELETE FROM events.generic_columns_info WHERE id = {generic.id}')
			conn.execute(f'ALTER TABLE events.{generic.entity} DROP COLUMN IF EXISTS {generic.name}')
			del ALL_GENERICS[generic.id]
	log.info(f'Generic removed by user ({uid}): {generic.name} => {generic.users}')
		