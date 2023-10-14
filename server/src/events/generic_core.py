import traceback
from time import time
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from database import log, pool
import data.omni.core as omni
from cream import gsm
from events.table import table_columns, select_from_root, parse_column_id

HOUR = 3600
MAX_DURATION_H = 72
MAX_DURATION_S = MAX_DURATION_H * HOUR

# Read Columns.tsx for g params reference

G_EXTREMUM = ['min', 'max', 'abs_min', 'abs_max']
G_OP_TIME = ['time_offset', 'time_offset_%']
G_OP_VALUE = G_OP_TIME + G_EXTREMUM +['mean', 'median', 'range', 'coverage']
G_OP_CLONE = ['clone_column']
G_OP_COMBINE = ['diff', 'abs_diff']
G_DERIVED = G_OP_CLONE + G_OP_COMBINE

G_EVENT = [t for t in table_columns if 'time' in table_columns[t]]
G_ENTITY = [t for t in G_EVENT if 'duration' in table_columns[t]]

G_SERIES = { # order matters (no it does not)
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
G_SERIES = {**G_SERIES, **{'$d_'+s: [d[0], d[1], f'δ({d[2]})'] for s, d in G_SERIES.items() }}

def _select(*query, root='forbush_effects'):
	columns = ','.join([f'EXTRACT(EPOCH FROM {e}.time)::integer'
		if 'time' == c else f'{e}.{c}' for e, c in query])
	select_query = f'SELECT {columns}\nFROM {select_from_root[root]} ORDER BY {root}.time'
	with pool.connection() as conn:
		curs = conn.execute(select_query)
		res = np.array(curs.fetchall())
	return [res[:,i] for i in range(len(query))]

def _select_series(t_from, t_to, series):
	actual_series = series[3:] if series.startswith('$d_') else series
	interval = [int(i) + offs * MAX_DURATION_S for i, offs in ([t_from, -1], [t_to, 1])]
	source, name, _ = G_SERIES[actual_series]
	if source == 'omni':
		res = omni.select(interval, [name])[0]
	else:
		res = gsm.select(interval, [name])[0]
	return np.array(res, dtype='f8')

def apply_shift(a, shift, stub=np.nan):
	if shift == 0:
		return a
	res = np.full_like(a, stub)
	if shift > 0:
		res[:-shift] = a[shift:]
	else:
		res[-shift:] = a[:shift]
	return res

def apply_delta(data, series):
	if not data.size or not series.startswith('$d_'):
		return data
	delta = np.empty_like(data)
	delta[1:] = data[1:] - data[:-1]
	delta[0] = np.nan
	return delta

# all data is presumed to be continuos
def _do_compute(generic, col_name=None):
	try:
		entity, op = generic.entity, generic.operation
		t_start = time()
		log.info(f'Computing {generic.pretty_name}')\

		if op in G_OP_COMBINE:
			lcol = parse_column_id(generic.column)
			rcol = parse_column_id(generic.other_column)
			target_id, lhv, rhv = _select([entity, 'id'], lcol, rcol)
			if 'diff' in op:
				result = lhv - rhv
			else:
				assert not 'reached'
			if 'abs' in op:
				result = np.abs(result)

		elif op in G_OP_CLONE:
			target_id, target_value = _select([entity, 'id'], parse_column_id(generic.column))
			result = apply_shift(target_value, generic.entity_offset, stub=None)

		elif op in G_OP_VALUE:
			target_id, event_start, event_duration = _select([(entity, a) for a in ('id', 'time', 'duration')])
			fisrt_hour = np.floor(event_start / HOUR) * HOUR
			last_hour  = fisrt_hour + event_duration * HOUR - HOUR

			if generic.series:
				t_data = time()
				data_series = _select_series(event_start[0], event_start[-1] + event_duration[-1] * HOUR, generic.series) # 400 ms
				data_time, data_value = data_series[:,0], data_series[:,1]
				log.debug(f'Got {actual_series} for {generic.pretty_name} in {round(time()-t_data, 2)}s')
			else:
				data_series = None

			def get_ref_time(ref: GenericRefPoint):
				if ref.type == 'event':
					# NOTE: possible optimization: same event's time may be queried twice here
					e_start, e_dur = (event_start, event_duration) if entity == ref.entity \
						else _select([ref.entity, 'time'], [ref.entity, 'duration'])
					e_start, e_dur = [apply_shift(a, ref.entity_offset) for a in (e_start, e_dur)]
					r_time = np.floor(e_start / HOUR) * HOUR
					if ref.end:
						r_time += r_time + e_dur * HOUR - HOUR
				elif ref.type == 'extremum':
					r_time = find_extremum()
				else:
					assert not 'reached'
				return r_time + ref.hours_offset * HOUR
					
			def get_slices(d_time, t_1, t_2): # inclusive, presumes hour alignment
				slice_len = np.abs(t_2 - t_1) // HOUR # FIXME: data should be continous, r-right?
				found = np.searchsorted(d_time, t_1, side='left')
				mask = np.logical_and(~np.isnan(slice_len), t_1 >= d_time[0], t_1 <= d_time[-1])
				left = np.where(slice_len < 0, found + slice_len, found)
				slice_len[mask] = 0
				return left, np.abs(slice_len).astype('i')

			def find_extremum(typ, ser, slice_left, slice_len):
				is_max, is_abs = 'max' in typ, 'abs' in typ
				# NOTE: possible optimization: same parameter may be queried twice here
				data = data_series if ser == g.series else \
					_select_series(data_time[slice_left[0]], data_time[slice_left[-1]+slice_len[-1]], ser)
				d_time, value = data[:,0], data[:,1]
				res = np.full((length, 2), np.nan, dtype='f8')
				value = np.abs(value) if is_abs else value
				func = lambda d: np.nan if np.isnan(d).all() \
					else (np.nanargmax(d) if is_max else np.nanargmin(d))
				if ser in ['a10', 'a10m']:
					for i in range(length):
							window = value[left[i]:left[i]+slice_len[i]]
							val = gsm.normalize_variation(window, with_trend=True)
							val = apply_delta(val, ser)
							idx = func(val)
							if not np.isnan(idx)
							result[i] = (d_time[left[i] + idx], val[idx])
				else:
					value = apply_delta(value, ser)
					idx = np.array([func(value[left[i]:left[i]+slice_len[i]]) for i in range(length)])
					nonempty = np.where(slice_len > 0)[0]
					didx = left[nonempty] + idx[nonempty]
					result[nonempty] = np.column_stack((d_time[didx], value[didx]))
				return result

			# compute poi time if poi present
			if g.poi in ENTITY_POI:
				poi_time = event_start if is_self_poi else target_time
				if g.poi.startswith('end'):
					poi_time += (event_duration if is_self_poi else target_duration) * HOUR
				left, slice_len = None, None
			elif g.poi:
				typ, ser = parse_extremum_poi(g.poi)
				data = data_series if ser == g.series else \
					np.array(_select(event_start[0], event_start[-1] + MAX_EVENT_LENGTH,
						ser[3:] if ser.startswith('$d_') else ser), dtype='f8')
				left, slice_len = get_event_windows(data[:,0], ser)
				poi_time = find_extremum(typ, ser, left, slice_len, data)[:,0]

			# compute target windows if needed
			if 'time_to' not in g.type and 'value' not in g.type:
				if g.poi:
					target_left, target_slen = get_poi_windows(data_time, poi_time)
				else:
					target_left, target_slen = get_event_windows(data_time, g.series)

			if 'time_to' in g.type:
				shift = g.shift
				s_poi_time = apply_shift(poi_time, shift)
				result = (s_poi_time - event_start) / HOUR
				if '%' in g.type:
					result = result / event_duration * 100
			elif g.type in EXTREMUM_TYPES:
				result = find_extremum(g.type, g.series, target_left, target_slen)[:,1]
			elif g.type in ['mean', 'median']:
				result = np.full(length, np.nan, dtype='f8')
				func = np.nanmean if g.type == 'mean' else np.nanmedian
				for i in range(length):
					if target_slen[i] < 1:
						continue
					window = data_value[target_left[i]:target_left[i]+target_slen[i]]
					result[i] = func(window)
			elif g.type == 'range':
				r_max = find_extremum('max', g.series, target_left, target_slen)[:,1]
				r_min = find_extremum('min', g.series, target_left, target_slen)[:,1]
				result = r_max - r_min
			elif g.type == 'coverage':
				result = np.full(length, np.nan, dtype='f8')
				for i in range(length):
					if target_slen[i] < 1:
						continue
					window = data_value[target_left[i]:target_left[i]+target_slen[i]]
					result[i] = np.count_nonzero(~np.isnan(window)) / target_slen[i] * 100
			elif g.type in ['value', 'avg_value']:
				result = np.full(length, np.nan, dtype='f8')
				shift = g.shift
				poi_hour = (np.floor(poi_time / HOUR) if shift <= 0 else np.ceil(poi_time / HOUR)) * HOUR
				start_hour = poi_hour + shift*HOUR if shift <= 0 else poi_hour
				window_len = max(1, abs(shift)) if 'avg' in g.type else 1
				per_hour = np.full((length, window_len), np.nan, dtype='f8')
				if g.series in ['a10', 'a10m']:
					ev_left, slice_len = get_event_windows(data_time, g.series)
					diff_lft = np.minimum(0, (start_hour - data_time[ev_left]) / HOUR).astype(np.int32)
					diff_rgt = np.maximum(0, (start_hour - data_time[ev_left+slice_len]) / HOUR + window_len - 1).astype(np.int32)
					left = ev_left + diff_lft
					slice_len[slice_len > 0] += diff_rgt[slice_len > 0]
					window_offset = ((data_time[ev_left] - start_hour) / HOUR).astype(np.int32)
					for i in range(length):
						sl = slice_len[i]
						if not sl:
							continue
						window = data_value[left[i]:left[i]+sl]
						idx = window_offset[i]
						if len(window) < window_len + idx:
							continue
						values = gsm.normalize_variation(window, with_trend=True)
						values = apply_delta(values, g.series)
						per_hour[i,] = values[idx:idx+window_len]
				else:
					data_value = apply_delta(data_value, g.series)
					for h in range(window_len):
						_, a_idx, b_idx = np.intersect1d(start_hour + h*HOUR, data_time, return_indices=True)
						per_hour[a_idx, h] = data_value[b_idx]
				nan_threshold = np.floor(window_len / 2)
				filter_nan = np.count_nonzero(np.isnan(per_hour), axis=1) <= nan_threshold
				result[filter_nan] = np.nanmean(per_hour[filter_nan], axis=1)
			else:
				assert not 'reached'

			if g.series == 'kp':
				result[result is not None] /= 10
			rounding = 1 if 'time_to' in g.type or 'coverage' == g.type else 2
			data = np.column_stack((np.where(np.isnan(result), None, np.round(result, rounding)), event_id.astype('i8')))
		else:
			assert not 'reached'

		log.info(f'Computed {g.name} in {round(time()-t_start,2)}s')
		return data
	except:
		log.error(f'Failed at {g.name}: {traceback.format_exc()}')
		return None

def _compute_generic(g):
	data = _do_compute(g)
	if data is None:
		return False
	t0 = time()
	update_q = f'UPDATE events.{g.entity} SET {g.name} = %s WHERE {g.entity}.id = %s'
	with pool.connection() as conn:
		apply_changes(data[:,1], data[:,0], g.entity, g.name, conn)
		conn.cursor().executemany(update_q, data.tolist())
		conn.execute('UPDATE events.generic_columns_info SET last_computed = CURRENT_TIMESTAMP WHERE id = %s', [g.id])
	print('update', round(time() - t0, 3))
	return True

def recompute_generics(generics):
	if not isinstance(generics, list):
		generics = [generics]
	with pool.connection() as conn:
		first = conn.execute('SELECT EXTRACT(EPOCH FROM time)::integer FROM events.forbush_effects ORDER BY time LIMIT 1').fetchone()[0]
		last = conn.execute('SELECT EXTRACT(EPOCH FROM time)::integer FROM events.forbush_effects ORDER BY time DESC LIMIT 1').fetchone()[0]
	omni.ensure_prepared([first - MAX_DURATION_S, last + 2 * MAX_DURATION_S])
	with ThreadPoolExecutor(max_workers=4) as executor:
		res = executor.map(_compute_generic, generics)
	return any(res)

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
