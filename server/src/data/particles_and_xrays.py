import os
from datetime import datetime, timezone, timedelta

import pymysql

from database import pool, upsert_many, log

T_PART = 'sat_particles'
T_XRAY = 'sat_xrays'

PARTICLES = {
	'e1k': '80-115 keV',
	'e2k': '115-165 keV',
	'e3k': '165-235 keV',
	'e4k': '235-340 keV',
	'e5k': '340-500 keV',
	'e6k': '500-700 keV',
	'e7k': '700-1000 keV',
	'e8k': '1000-1900 keV',
	'e9k': '1900-3200 keV',
	'e10k': '3200-6500 keV',
	'p1': '>1 MeV',
	'p2': '>5 MeV',
	'p3': '>10 MeV',
	'p4': '>30 MeV',
	'p5': '>50 MeV',
	'p6': '>60 MeV',
	'p7': '>100 MeV',
	'p8': '>500 MeV'
}

def _init():
	with pool.connection() as conn:
		pcols = ', '.join([c+' real' for c in PARTICLES])
		conn.execute(f'CREATE TABLE IF NOT EXISTS {T_PART} (time timestamptz primary key, {pcols})')
_init()

def _obtain_goes_particles(t_from, t_to):
	dt_from, dt_to = [datetime.utcfromtimestamp(t) for t in (t_from, t_to)]
	dt_from = dt_from.replace(day=1, hour=0, minute=0, second=0)
	dt_to = (dt_from + timedelta(days=31)).replace(day=1)
	try:
		log.debug(f'GOES: obtaining particles: {dt_from} - {dt_to}')
		conn = pymysql.connect(
			host=os.environ.get('CRS_HOST'),
			port=int(os.environ.get('CRS_PORT', 0)),
			user=os.environ.get('CRS_USER'),
			password=os.environ.get('CRS_PASS'),
			database='goes')
		with conn.cursor() as cursor:
			q = f'SELECT dt, {",".join(PARTICLES.keys())} FROM goes_particles WHERE dt >= %s AND dt < %s'
			cursor.execute(q, [dt_from, dt_to])
			data = list(cursor.fetchall())
			upsert_many(T_PART, ['time', *PARTICLES.keys()], data)
	except Exception as e:
		log.error(f'GOES: failed to obtain (crs): {e}')
	finally:
		conn.close()

def fetch_particles(t_from, t_to, which=['p1', 'p5', 'p7'], obtain=True):
	expected_count = (t_to - t_from) // 300
	query = [f for f in which if f in PARTICLES]
	with pool.connection() as conn:
		cl = ','.join(query)
		res = conn.execute(f'SELECT EXTRACT(EPOCH FROM time)::integer, {cl} FROM {T_PART} '+\
			'WHERE to_timestamp(%s) <= time AND time <= to_timestamp(%s) '+\
				'ORDER BY time', [t_from, t_to]).fetchall()
	if (len(res) > 0 and len(res) >= expected_count - 3) or not obtain:
		return res

	_obtain_goes_particles(t_from, t_to)
	return fetch_particles(t_from, t_to, which, obtain=False)

def fetch_xrays(t_from, t_to):
	return []