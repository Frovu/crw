import os
from datetime import datetime, timedelta, timezone

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
XRAYS = {
	's': '0.05-0.4 nm',
	'l': '0.1-0.8 nm'
}
GOES_X_EPOCH = datetime(2009, 11, 26, tzinfo=timezone.utc)

def _init():
	with pool.connection() as conn:
		pcols = ', '.join([c+' real' for c in PARTICLES])
		conn.execute(f'CREATE TABLE IF NOT EXISTS {T_PART} (time timestamptz primary key, {pcols})')
		conn.execute(f'CREATE TABLE IF NOT EXISTS {T_XRAY} (time timestamptz primary key, s real, l real)')
_init()

def _obtain_goes(which, t_from, t_to):
	xra = which == 'xrays'
	dt_from, dt_to = [datetime.utcfromtimestamp(t) for t in (t_from, t_to)]
	dt_from = dt_from.replace(day=1, hour=0, minute=0, second=0)
	dt_to = (dt_from + timedelta(days=31)).replace(day=1)
	table = ('goes_xrays_goes_x' if dt_from < GOES_X_EPOCH else 'goes_xrays') if xra else 'goes_particles'
	cols = ['s', 'l'] if xra else PARTICLES.keys()
	try:
		log.debug('GOES: obtaining %s: %s - %s', which, dt_from, dt_to)
		conn = pymysql.connect(
			host=os.environ.get('CRS_HOST'),
			port=int(os.environ.get('CRS_PORT', 0)),
			user=os.environ.get('CRS_USER'),
			password=os.environ.get('CRS_PASS'),
			database='goes')
		with conn.cursor() as cursor:
			q = f'SELECT dt, {",".join(cols)} FROM {table} WHERE dt >= %s AND dt < %s'
			cursor.execute(q, [dt_from, dt_to])
			data = list(cursor.fetchall())
			upsert_many(T_XRAY if xra else T_PART, ['time', *cols], data)
	except Exception as e:
		log.error(f'GOES: failed to obtain (crs): {e}')
	finally:
		conn.close()

def fetch(which, t_from, t_to, query=['p1', 'p5', 'p7'], obtain=True):
	xra = which == 'xrays'
	expected_count = (t_to - t_from) // 300
	query = ['s', 'l'] if xra else [f for f in (query or []) if f in PARTICLES]
	if len(query) < 1:
		raise ValueError('Empty query')
	with pool.connection() as conn:
		cl = ','.join(query)
		curs = conn.execute(f'SELECT EXTRACT(EPOCH FROM time)::integer as time, {cl} FROM {T_XRAY if xra else T_PART} '+\
			'WHERE to_timestamp(%s) <= time AND time <= to_timestamp(%s) '+\
				'ORDER BY time', [t_from, t_to])
		res, cols = curs.fetchall(), [desc[0] for desc in curs.description]
	if (len(res) > 0 and len(res) >= expected_count - 3) or not obtain:
		return res, cols

	_obtain_goes(which, t_from, t_to)
	return fetch(which, t_from, t_to, query, obtain=False)
