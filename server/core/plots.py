from datetime import timedelta
import numpy as np
from core.database import pool
from core.generic_columns import SERIES
from data_series.gsm.database import normalize_variation

def epoch_collision(times: list[int], interval: [int, int], series: str):
	if series not in SERIES:
		raise ValueError('series not found')
	src, ser, _ = SERIES[series]
	table = 'gsm_result' if src == 'gsm' else 'omni'

	is_delta = series.startswith('$d_')
	if is_delta:
		interval[0] -= 1

	with pool.connection() as conn:
		query = f'''SELECT array(
			SELECT {ser} FROM generate_series(to_timestamp(epoch) + %s, to_timestamp(epoch) + %s, '1 hour'::interval) tm
			LEFT JOIN {table} ON time = tm {'AND NOT is_gle' if src == 'gsm' else ''}
		) FROM (select unnest(%s)) vals(epoch);'''
		resp = conn.execute(query, [*[timedelta(hours=i) for i in interval], times]).fetchall()
		windows = np.array([r[0] for r in resp], dtype='f8')
	if ser in ['a10', 'a10m']:
		windows = np.array([normalize_variation(w) for w in windows])

	if is_delta:
		windows[:,1:] = windows[:,1:] - windows[:,:-1]
		windows = windows[:,1:]

	offset = np.arange(windows.shape[1]) + interval[0]
	median = np.nanmedian(windows, axis=0)
	mean = np.nanmean(windows, axis=0)
	std = np.nanstd(windows, axis=0)

	return offset, median, mean, std
