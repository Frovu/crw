from core.database import pg_conn
import numpy

with pg_conn.cursor() as cursor:
	cursor.execute('''CREATE TABLE IF NOT EXISTS gsm_result (
	time TIMESTAMPTZ NOT NULL UNIQUE,
	A10 REAL, Ax REAL, Ay REAL, Az REAL, Axy REAL)''')
	pg_conn.commit()

def select(interval, what=None):
	if not what: what = '*'
	with pg_conn.cursor() as cursor:
		q = f'SELECT %s FROM gsm_result WHERE time >= to_timestamp(%s) AND time <= to_timestamp(%s) ORDER BY time'
		cursor.execute(q, [what, *interval])
		return numpy.array(cursor.fetchall()), [desc[0] for desc in cursor.description]
