from core.database import pool, SERIES
from data_series.gsm.database import normalize_variation
from datetime import timedelta
import numpy as np

def epoch_collision(times: list[int], interval: [int, int], series: str):
	if series not in SERIES:
		raise ValueError('series not found')
	db, ser, _ = SERIES[series]
	table = 'gsm_result' if db == 'gsm' else 'omni'

	# TODO: GLE mask
	
	with pool.connection() as conn:
		q = f'''SELECT array(
			SELECT {ser} FROM generate_series(to_timestamp(epoch) + %s, to_timestamp(epoch) + %s, '1 hour'::interval) tm
			LEFT JOIN {table} ON time = tm
		) FROM (select unnest(%s)) vals(epoch);'''
		resp = conn.execute(q, [*[timedelta(days=i) for i in interval], times]).fetchall()
		windows = np.array([r[0] for r in resp], dtype='f8')
	if series in ['a10', 'a10m']:
		windows = np.array([normalize_variation(w) for w in windows])

	offset = np.arange(windows.shape[1]) + interval[0] * 24
	median = np.nanmedian(windows, axis=0)
	mean = np.nanmean(windows, axis=0)
	std = np.std(windows, axis=0)

	return offset, median, mean, std