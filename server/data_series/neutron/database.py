import os, logging, pymysql.cursors, numpy
import psycopg2, psycopg2.extras
from threading import Timer
from datetime import datetime

from data_series.util import integrity_query
from core.database import pg_conn

log = logging.getLogger('aides')

PERIOD = 3600
nmdb_conn = None
discon_timer = None

def _init():
	path = os.path.join(os.path.dirname(__file__), './database_init.sql')
	with open(path) as file, pg_conn.cursor() as cursor:
		cursor.execute(file.read())
	pg_conn.commit()
_init()

def _disconnect_nmdb():
	global nmdb_conn, discon_timer
	if nmdb_conn:
		log.debug('Disconnecting NMDB')
		nmdb_conn.close()
		nmdb_conn = None
	discon_timer = None

def _connect_nmdb():
	global nmdb_conn, discon_timer
	if not nmdb_conn:
		log.info('Connecting to NMDB')
		nmdb_conn = pymysql.connect(
			host=os.environ.get('NMDB_HOST'),
			port=int(os.environ.get('NMDB_PORT', 0)),
			user=os.environ.get('NMDB_USER'),
			password=os.environ.get('NMDB_PASS'),
			database='nmdb')
	if discon_timer:
		discon_timer.cancel()
		discon_timer = None
	discon_timer = Timer(180, _disconnect_nmdb)
	discon_timer.start()

def _obtain_nmdb(interval, station, pg_cursor):
	_connect_nmdb()
	dt_interval = [datetime.utcfromtimestamp(t) for t in interval]
	query = f'''SELECT date_add(date(start_date_time), interval extract(hour from start_date_time) hour) as time,
		round(avg(corr_for_efficiency), 4), round(avg(pressure_mbar), 2)
		FROM {station}_revori WHERE start_date_time >= %s AND start_date_time < %s + interval 1 hour
		GROUP BY date(start_date_time), extract(hour from start_date_time)'''
	with nmdb_conn.cursor() as cursor:
		try:
			cursor.execute(query, dt_interval)
		except:
			log.warning('Failed to query nmdb, disconnecting')
			return _disconnect_nmdb()
		data = cursor.fetchall()
	log.debug(f'Neutron: obtain nmdb:{station} [{len(data)}] {dt_interval[0]} to {dt_interval[1]}')
	if len(data) < 1:
		q = f'INSERT INTO neutron_counts (time, station) SELECT ts, \'{station}\' FROM generate_series(to_timestamp({interval[0]}),to_timestamp({interval[1]}),\'{PERIOD} s\'::interval) ts '
		q += 'ON CONFLICT (time, station) DO UPDATE SET obtain_time = CURRENT_TIMESTAMP'
		return pg_cursor.execute(q)
	query = f'''WITH data(time, original, pressure) AS (VALUES %s)
		INSERT INTO neutron_counts (time, station, original, pressure)
		SELECT ts, \'{station}\', data.original, data.pressure
		FROM generate_series(to_timestamp({interval[0]}),to_timestamp({interval[1]}),'{PERIOD} s'::interval) ts
		LEFT JOIN data ON ts = data.time
		ON CONFLICT (time, station) DO UPDATE SET obtain_time = CURRENT_TIMESTAMP, original = EXCLUDED.original'''
	psycopg2.extras.execute_values(pg_cursor, query, data, template=f'(%s,%s,%s)')

def _fetch_one(interval, station):
	with pg_conn.cursor() as cursor:
		if pg_conn.status == psycopg2.extensions.STATUS_IN_TRANSACTION:
			pg_conn.rollback()
		# TODO: optionally mark all records older than certain time as bad
		try:
			cursor.execute(integrity_query(*interval, PERIOD, 'neutron_counts', 'obtain_time', where=f'station=\'{station}\'',
				bad_condition=f'original IS NULL AND \'now\'::timestamp - obtain_time > \'{PERIOD} s\'::interval', bad_cond_columns=['original']))
			if gaps := cursor.fetchall():
				for gap in gaps:
					_obtain_nmdb(gap, station, cursor)
				pg_conn.commit()
			cursor.execute(f'''SELECT COALESCE(corrected, original) FROM generate_series(to_timestamp(%s),to_timestamp(%s),'%s s'::interval) ts
			LEFT JOIN neutron_counts n ON ts=n.time AND station=%s''', [*interval, PERIOD, station])
		except psycopg2.errors.InFailedSqlTransaction:
			pg_conn.rollback()
			log.warning(f'Neutron: InFailedSqlTransaction, rolling back')
			_fetch_one(interval, station)
		return numpy.array(cursor.fetchall(), dtype=numpy.float32)

def fetch(interval: [int, int], stations: list[str]):
	trim_future = datetime.now().timestamp() // PERIOD * PERIOD
	t_from, t_to = interval
	t_to = int(trim_future - PERIOD) if t_to >= trim_future else t_to
	times = numpy.arange(t_from, t_to+1, PERIOD)
	# log.debug(f'fetch {t_from}:{t_to} ' + ','.join(stations))
	return numpy.column_stack([times]+[_fetch_one((t_from, t_to), s) for s in stations])

def select_stations():
	try:
		with pg_conn.cursor() as cursor:
			cursor.execute('SELECT id, drift_longitude FROM neutron_stations')
			return cursor.fetchall()
	except psycopg2.errors.InFailedSqlTransaction:
		pg_conn.rollback()
		log.warning(f'Neutron: InFailedSqlTransaction, rolling back')
		return select_stations()