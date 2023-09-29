
import os
from datetime import datetime
from threading import Timer
import pymysql.cursors
from database import log

NMDB_KEEP_CONN_S = 180
nmdb_conn = None
discon_timer = None

def _disconnect_nmdb():
	global nmdb_conn, discon_timer
	if nmdb_conn:
		nmdb_conn.close()
		nmdb_conn = None
		log.debug('Disconnecting NMDB')
	discon_timer = None

def _connect_nmdb():
	global nmdb_conn, discon_timer
	if not nmdb_conn:
		log.info('Connecting to NMDB')
		nmdb_conn = pymysql.connect(
			host=os.environ.get('NMDB_HOST'),
			port=int(os.environ.get('NMDB_PORT', 3306)),
			user=os.environ.get('NMDB_USER'),
			password=os.environ.get('NMDB_PASS'),
			database='nmdb')
	if discon_timer:
		discon_timer.cancel()
		discon_timer = None
	discon_timer = Timer(NMDB_KEEP_CONN_S, _disconnect_nmdb)
	discon_timer.start()

# NOTE: This presumes that all data is 1-minute resolution and aligned
def obtain(interval, stations):
	_connect_nmdb()
	log.debug('Neutron: querying nmdb')
	dt_interval = [datetime.utcfromtimestamp(t) for t in interval]
	query = f'''
WITH RECURSIVE ser(time) AS (
	SELECT TIMESTAMP(%(from)s) UNION ALL 
	SELECT DATE_ADD(time, INTERVAL 1 minute) FROM ser WHERE time < %(to)s + interval 59 minute)
SELECT ser.time, {", ".join([st + '_revori.corr_for_efficiency' for st in stations])} FROM ser\n'''
	for station in stations:
		query += f'LEFT OUTER JOIN {station}_revori ON {station}_revori.start_date_time = ser.time\n'
	with nmdb_conn.cursor() as curs:
		try:
			curs.execute(query, {'from': dt_interval[0], 'to': dt_interval[1]})
		except BaseException as exc:
			log.warning('Failed to query nmdb, disconnecting: %s', str(exc))
			return _disconnect_nmdb()
		data = curs.fetchall()
	return data
