from core.database import pool
import numpy as np

series = ['a10', 'a10m', 'ax', 'ay', 'az', 'axy', 'phi_axy']

with pool.connection() as conn:
	conn.execute(f'''CREATE TABLE IF NOT EXISTS gsm_result (
	time TIMESTAMPTZ NOT NULL UNIQUE,
	{', '.join([s+' REAL' for s in series])},
	is_gle BOOL NOT NULL DEFAULT 'f')''')

def select(interval: [int, int], what='A10m', mask_gle=True):
	if type(what) is not list:
		what = [what]
	what = [s for s in what if s.lower() in series]
	with pool.connection() as conn:
		where = ''
		q = f'''SELECT EXTRACT(EPOCH FROM time)::integer as time,{",".join(what)} FROM (
			SELECT time, {",".join(what)} FROM gsm_result {'WHERE not is_gle' if mask_gle else ''}
			{f'UNION SELECT time,{",".join(["NULL" for w in what])} FROM gsm_result where is_gle' if mask_gle else ''}
		) as res WHERE res.time >= to_timestamp(%s) AND res.time <= to_timestamp(%s) ORDER BY res.time'''
		curs = conn.execute(q, interval)
		return np.array(curs.fetchall(), dtype='f8'), [desc[0] for desc in curs.description]

def normalize_variation(data, with_trend=False):
	if with_trend:
		xs = np.arange(len(data))
		mask = np.isfinite(data)
		trend = np.polyfit(xs[mask], data[mask], 1)
		if trend[0] > 0:
			ys = np.poly1d(trend)(xs)
			data = data - ys + ys[0]
	d_max = np.nanmax(data)
	return (data - d_max) / (1 + d_max / 100)