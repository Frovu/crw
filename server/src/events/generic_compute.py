from database import log, pool
from events.generic_columns import apply_changes

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
				t_data = time()
				data_series = np.array(_select(event_start[0], event_start[-1] + MAX_EVENT_LENGTH, actual_series), dtype='f8') # 400 ms
				log.debug(f'Got {actual_series} for {column} in {round(time()-t_data, 2)}s')
				data_time, data_value = data_series[:,0], data_series[:,1]
			else: data_series = None
			length = len(event_id)

			def apply_delta(data, series):
				if not data.size or not series.startswith('$d_'):
					return data
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
				func = lambda d: 0 if np.isnan(d).all() else (np.nanargmax(d) if is_max else np.nanargmin(d))
				if ser in ['a10', 'a10m']:
					for i in range(length):
						if slice_len[i] > 1:
							window = value[left[i]:left[i]+slice_len[i]]
							val = gsm.normalize_variation(window, with_trend=True)
							val = apply_delta(val, ser)
							idx = func(val)
							result[i] = (d_time[left[i] + idx], val[idx])
				else:
					value = apply_delta(value, ser)
					idx = np.array([func(value[left[i]:left[i]+slice_len[i]]) for i in range(length)])
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
					np.array(_select(event_start[0], event_start[-1] + MAX_EVENT_LENGTH,
						ser[3:] if ser.startswith('$d_') else ser), dtype='f8')
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
				func = np.nanmean if generic.type == 'mean' else np.nanmedian
				for i in range(length):
					if target_slen[i] < 1:
						continue
					window = data_value[target_left[i]:target_left[i]+target_slen[i]]
					result[i] = func(window)
			elif generic.type == 'range':
				r_max = find_extremum('max', generic.series, target_left, target_slen)[:,1]
				r_min = find_extremum('min', generic.series, target_left, target_slen)[:,1]
				result = r_max - r_min
			elif generic.type == 'coverage':
				result = np.full(length, np.nan, dtype='f8')
				for i in range(length):
					if target_slen[i] < 1:
						continue
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
						values = apply_delta(values, generic.series)
						per_hour[i,] = values[idx:idx+window_len]
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

			if generic.series == 'kp':
				result[result is not None] /= 10
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
	except:
		log.error(f'Failed at {column}: {traceback.format_exc()}')
		return False


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

def recompute_generics(generics, columns=None):
	if not isinstance(generics, list):
		generics = [generics]
	with ThreadPoolExecutor(max_workers=4) as executor:
		res = executor.map(compute_generic, generics, columns) \
			if columns else executor.map(compute_generic, generics)
	return any(res)

def compute_default_generics():
	with pool.connection() as conn:
		first = conn.execute('SELECT EXTRACT(EPOCH FROM time)::integer FROM events.forbush_effects ORDER BY time LIMIT 1').fetchone()[0]
		last = conn.execute('SELECT EXTRACT(EPOCH FROM time)::integer FROM events.forbush_effects ORDER BY time DESC LIMIT 1').fetchone()[0]
	omni.ensure_prepared([first - 24 * HOUR, last + 72 * HOUR])
	recompute_generics(list(PRESET_GENERICS.values()), PRESET_GENERICS.keys())