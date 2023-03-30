from core.database import pool
import numpy

series = ['A10', 'A10m', 'Ax', 'Ay', 'Az', 'Axy']

with pool.connection() as conn:
	conn.execute('''CREATE TABLE IF NOT EXISTS gsm_result (
	time TIMESTAMPTZ NOT NULL UNIQUE,
	A10 REAL, A10m REAL, Ax REAL, Ay REAL, Az REAL, Axy REAL)''')

def select(interval: [int, int], what=None):
	if not what: what = 'A10m,Ax,Ay,Az,Axy'
	with pool.connection() as conn:
		q = f'SELECT EXTRACT(EPOCH FROM time)::integer as time, {what} FROM gsm_result WHERE time >= to_timestamp(%s) AND time <= to_timestamp(%s) ORDER BY time'
		curs = conn.execute(q, interval)
		return numpy.array(curs.fetchall()), [desc[0] for desc in curs.description]
