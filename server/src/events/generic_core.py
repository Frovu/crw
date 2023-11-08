from dataclasses import dataclass
import traceback
from time import time
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from database import log, pool
import data.omni.core as omni
from cream import gsm
from events.table import table_columns, select_from_root, parse_column_id

@dataclass
class GenericRefPoint:
	type: str # event | extremum
	hours_offset: int
	operation: str = None
	series: str = None
	entity_offset: int = None
	entity: str = None
	end: bool = None

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

def default_window(ent): 
	return [
		GenericRefPoint('event', 0, entity=ent, entity_offset=0),
		GenericRefPoint('event', 0, entity=ent, entity_offset=0, end=True),
	]

def _select(for_rows, query, root='forbush_effects'):
	columns = ','.join([f'EXTRACT(EPOCH FROM {e}.time)::integer'
		if 'time' == c else f'{e}.{c}' for e, c in query])
	select_query = f'SELECT {columns}\nFROM {select_from_root[root]} '
	if for_rows is not None:
		select_query += f'WHERE {query[0][0]}.id = ANY(%s) '
	with pool.connection() as conn:
		curs = conn.execute(select_query + f'ORDER BY {root}.time', [] if for_rows is None else [for_rows])
		res = np.array(curs.fetchall(), dtype='f8')
	return [res[:,i] for i in range(len(query))]

def _select_series(t_from, t_to, series):
	t_data = time()
	actual_series = series[3:] if series.startswith('$d_') else series
	interval = [int(i) + offs * MAX_DURATION_S for i, offs in ([t_from, -2], [t_to, 2])]
	source, name, _ = G_SERIES[actual_series]
	if source == 'omni':
		res = omni.select(interval, [name])[0]
	else:
		res = gsm.select(interval, [name])
	arr = np.array(res, dtype='f8')
	if len(arr) - (arr[-1,0] - arr[0,0]) // HOUR > 1: # FIXME: data may shift by 1 hour ??
		log.error('Data is not continous for %s', series)
		raise BaseException('Data is not continous')
	log.debug(f'Got {actual_series} in {round(time()-t_data, 3)}s')
	return arr[:,0], arr[:,1]

def get_ref_time(for_rows, ref: GenericRefPoint, cache={}): # always (!) rounds down
	if ref.type == 'event':
		has_dur = ref.entity in G_ENTITY
		res = cache.get(ref.entity) or \
			_select(for_rows, [(ref.entity, a) for a in ('time',) + (('duration',) if has_dur else ())])
		cache[ref.entity] = res
		e_start, e_dur = res if has_dur else (res, [])
		e_start, e_dur = [apply_shift(a, ref.entity_offset) for a in (e_start, e_dur)]
		r_time = np.floor(e_start / HOUR) * HOUR
		if ref.end:
			r_time = r_time + e_dur * HOUR - HOUR
	elif ref.type == 'extremum':
		r_time = find_extremum(for_rows, ref.operation, ref.series, default_window(ref.entity), cache=cache)
	else:
		assert not 'reached'
	return r_time + ref.hours_offset * HOUR
					
def get_slices(t_time, t_1, t_2):
	t_l = np.minimum(t_1, t_2)
	t_r = np.maximum(t_1, t_2)
	left = (t_l - t_time[0]) // HOUR
	slice_len = (t_r - t_l) // HOUR + 1 # end inclusive
	left[np.isnan(left)] = -1
	slice_len[left < 0] = 0
	slice_len[np.isnan(slice_len)] = 0
	return [np.s_[int(l):int(l+sl)] for l, sl in zip(left, slice_len)]

def find_extremum(for_rows, op, ser, window, cache={}, return_value=False):
	is_max, is_abs = 'max' in op, 'abs' in op
	t_1, t_2 = [get_ref_time(for_rows, r) for r in window]
	d_time, value = cache.get(ser) or _select_series(t_1[0], t_2[-1], ser)
	cache[ser] = (d_time, value)
	slices = get_slices(d_time, t_1, t_2)
	value = np.abs(value) if is_abs else value
	func = lambda d: np.nan if np.isnan(d).all() \
		else (np.nanargmax(d) if is_max else np.nanargmin(d))
	if ser in ['a10', 'a10m']: # TODO: Az?
		result = np.empty(len(t_1), dtype='f8')
		for i in range(len(t_1)):
			if (slices[i].start < 0):
				result[i] = np.nan
				continue
			d_slice = value[slices[i]]
			val = gsm.normalize_variation(d_slice, with_trend=True)
			val = apply_delta(val, ser)
			result[i] = func(val) + slices[i].start
			if return_value: # this is hacky
				value[int(result[i])] = val[int(result[i]) - slices[i].start]
	else:
		value = apply_delta(value, ser)
		result = np.array([func(value[sl]) + sl.start for sl in slices])
	if return_value:
		result = np.array([(i if np.isnan(i) else value[int(i)]) for i in result])
	return result

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

def _do_compute(generic, for_rows=None):
	entity, para = generic.entity, generic.params
	op = para.operation

	if op in G_OP_CLONE:
		target_id, target_value = _select(for_rows, [[entity, 'id'], parse_column_id(para.column)])
		return target_id, apply_shift(target_value, para.entity_offset, stub=None)

	if op in G_OP_COMBINE:
		lcol = parse_column_id(para.column)
		rcol = parse_column_id(para.other_column)
		target_id, lhv, rhv = _select(for_rows, [[entity, 'id'], lcol, rcol])
		if 'diff' in op:
			result = lhv - rhv
		else:
			assert not 'reached'
		if 'abs' in op:
			result = np.abs(result)
		return target_id, result

	assert op in G_OP_VALUE
	
	target_id, event_start, event_duration = _select(for_rows, [(entity, a) for a in ('id', 'time', 'duration')])
	# for t in event_start:
	# 	from datetime import datetime
	# 	print(datetime.utcfromtimestamp(t))
	cache = { entity: (event_start, event_duration) }

	if op in G_OP_TIME:
		if op.startswith('time_offset'):
			t_1, t_2 = [get_ref_time(for_rows, r) for r in (para.reference, para.boundary)]
			result = (t_2 - t_1) / HOUR
			if '%' in op:
				result = result / event_duration * 100
		else:
			assert not 'reached'

	elif op in G_EXTREMUM:
		window = (para.reference, para.boundary)
		result = find_extremum(for_rows, op, para.series, window, cache, return_value=True)

	else:
		t_1, t_2 = [get_ref_time(for_rows, r) for r in (para.reference, para.boundary)]
		d_time, d_value = cache.get(para.series) or _select_series(t_1[0], t_2[-1], para.series)
		cache[para.series] = (d_time, d_value)
		slices = get_slices(d_time, t_1, t_2)

		if op in ['mean', 'median']:
			func = np.nanmean if op == 'mean' else np.nanmedian
			result = np.array([(func(d_value[sl]) if sl.stop - sl.start > 0 else np.nan) for sl in slices])

		elif op in ['range']:
			window = (para.reference, para.boundary)
			max_val = find_extremum(for_rows, 'max', para.series, window, cache, return_value=True)
			min_val = find_extremum(for_rows, 'min', para.series, window, cache, return_value=True)
			result = max_val - min_val

		elif op in ['coverage']:
			result = np.array([np.count_nonzero(~np.isnan(d_value[sl])) \
				/ ((sl.stop - sl.start) or 1) * 100 for sl in slices])
		
		else:
			assert not 'reached'
	return target_id, result

def compute_generic(g, for_row=None):
	print(g.pretty_name, flush=True)
	try:
		t_start = time()
		log.debug(f'Computing {g.pretty_name}')
		if for_row is not None:
			ids = _select(None, [(g.entity, 'id')])[0].astype(int)
			idx = np.where(ids == for_row)[0][0]
			margin = 3
			target_id, result = _do_compute(g, ids[idx-margin:idx+margin+1].tolist())
			target_id, result = target_id[margin:margin+1], result[margin:margin+1]
		else:
			target_id, result = _do_compute(g)
		if result is None:
			return False
		log.info(f'Computed {g.pretty_name} in {round(time()-t_start,2)}s')
		target_id = target_id.astype('i8')
		if g.params.series == 'kp':
			result[result] /= 10
		result = np.where(~np.isfinite(result), None, np.round(result, 2))
		update_q = f'UPDATE events.{g.entity} SET {g.name} = %s WHERE {g.entity}.id = %s'
		with pool.connection() as conn:
			apply_changes(target_id, result, g.entity, g.name, conn)
			data = np.column_stack((result, target_id)).tolist()
			conn.cursor().executemany(update_q, data)
			conn.execute('UPDATE events.generic_columns_info SET last_computed = CURRENT_TIMESTAMP WHERE id = %s', [g.id])
		return True
	except:
		log.error(f'Failed at generic {g.pretty_name}: {traceback.format_exc()}')
		return False

def recompute_generics(generics):
	if not isinstance(generics, list):
		generics = [generics]
	with pool.connection() as conn:
		first = conn.execute('SELECT EXTRACT(EPOCH FROM time)::integer FROM events.forbush_effects ORDER BY time LIMIT 1').fetchone()[0]
		last = conn.execute('SELECT EXTRACT(EPOCH FROM time)::integer FROM events.forbush_effects ORDER BY time DESC LIMIT 1').fetchone()[0]
	omni.ensure_prepared([first - MAX_DURATION_S, last + 2 * MAX_DURATION_S])
	with ThreadPoolExecutor(max_workers=4) as executor:
		res = executor.map(compute_generic, generics)
	return any(res)

def recompute_for_row(generics, rid):
	with ThreadPoolExecutor(max_workers=4) as executor:
		func = lambda g: compute_generic(g, rid)
		res = executor.map(func, generics)
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
