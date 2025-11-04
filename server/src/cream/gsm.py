import numpy as np
from database import pool

series = ['a10', 'a10m', 'ax', 'ay', 'az', 'axy', 'phi_axy']

def _init():
	with pool.connection() as conn:
		conn.execute(f'''CREATE TABLE IF NOT EXISTS gsm_result (
		time TIMESTAMPTZ NOT NULL UNIQUE,
		{', '.join([s+' REAL' for s in series])},
		is_gle BOOL NOT NULL DEFAULT 'f')''')
_init()

def select(interval: list[int], what=['A0m'], mask_gle=True, with_fields=False):
	what = [s for s in what if s.lower().replace('a0', 'a10') in series]
	if len(what) < 1:
		return ([], []) if with_fields else []
	with pool.connection() as conn:
		cols = [f'CASE WHEN is_gle THEN NULL ELSE {w} END' for w in what] if mask_gle else what
		query = f'''SELECT EXTRACT(EPOCH FROM time)::integer as time, {",".join(cols)}
			FROM gsm_result WHERE to_timestamp(%s) <= time AND time <= to_timestamp(%s) ORDER BY time'''
		curs = conn.execute(query, interval)
		return (curs.fetchall(), [desc.name for desc in curs.description]) if with_fields else curs.fetchall()

def normalize_variation(data, with_trend=False, to_avg=False):
	if with_trend:
		xs = np.arange(data.shape[0])
		mask = np.isfinite(data)
		if np.count_nonzero(mask) > 1:
			trend = np.polyfit(xs[mask], data[mask], 1)
			if trend[0] > 0 and data[-1] > data[0]:
				ys = np.poly1d(trend)(xs)
				data = data - ys + ys[0]
	if not len(data):
		return data
	d_max = np.nanmean(data) if to_avg else np.nanmax(data)
	return (data - d_max) / (1 + d_max / 100)