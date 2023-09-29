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

def select(interval: [int, int], what=['A0m'], mask_gle=True, with_fields=False):
	what = [s for s in what if s.lower().replace('a0', 'a10') in series]
	if len(what) < 1:
		return ([], []) if with_fields else []
	with pool.connection() as conn:
		query = f'''SELECT EXTRACT(EPOCH FROM time)::integer as time, {",".join(what)}
			FROM gsm_result WHERE time >= to_timestamp(%s) AND time <= to_timestamp(%s)
			{'AND NOT is_gle ' if mask_gle else ''}ORDER BY time'''
		curs = conn.execute(query, interval)
		return (curs.fetchall(), [desc.name for desc in curs.description]) if with_fields else curs.fetchall()

def normalize_variation(data, with_trend=False, to_avg=False):
	if with_trend:
		xs = np.arange(data.shape[0])
		mask = np.isfinite(data)
		trend = np.polyfit(xs[mask], data[mask], 1)
		if trend[0] > 0:
			ys = np.poly1d(trend)(xs)
			data = data - ys + ys[0]
	d_max = np.nanmean(data) if to_avg else np.nanmax(data)
	return (data - d_max) / (1 + d_max / 100)