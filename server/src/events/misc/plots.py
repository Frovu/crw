from datetime import timedelta
import numpy as np

from database import pool, SQL, Identifier
from cream.gsm import normalize_variation
from events.columns.series import find_series

def epoch_collision(times: list[int], interval: list[int], ser_name: str):
	series = find_series(ser_name)

	with pool.connection() as conn:
		query = SQL(f'''SELECT array(
			SELECT {{}} FROM generate_series(to_timestamp(epoch) + %s, to_timestamp(epoch) + %s, '1 hour'::interval) tm
			LEFT JOIN {{}} ON time = tm {'AND NOT is_gle' if series.source == 'gsm' else ''}
		) FROM (select unnest(%s)) vals(epoch);''').format(Identifier(series.db_name), Identifier(series.table_name()))
		resp = conn.execute(query, [*[timedelta(hours=i) for i in interval], times]).fetchall()
		windows = np.array([r[0] for r in resp], dtype='f8')

	if series.name in ['a10', 'a10m']:
		windows = np.array([normalize_variation(w) for w in windows])

	offset = np.arange(windows.shape[1]) + interval[0]
	median = np.nanmedian(windows, axis=0)
	mean = np.nanmean(windows, axis=0)
	std = np.nanstd(windows, axis=0)

	return offset, median, mean, std
