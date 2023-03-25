import os, logging, pymysql.cursors, numpy
import psycopg2, psycopg2.extras
from threading import Timer
from datetime import datetime, timedelta
from pathlib import Path

from data_series.util import integrity_query, align_interval
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
	query = f'''INSERT INTO neutron_counts (station, time, original, pressure)
		SELECT \'{station}\', * FROM (VALUES %s) v
		ON CONFLICT (time, station) DO UPDATE SET obtain_time = CURRENT_TIMESTAMP, original = EXCLUDED.original, pressure = EXCLUDED.pressure'''
	psycopg2.extras.execute_values(pg_cursor, query, data, template='(%s, %s::real, %s::real)')

def _obtain_local(interval, station, pg_cursor):
	dt_from, dt_to = [datetime.utcfromtimestamp(t) for t in interval]
	p = Path(os.environ.get('NM_C_PATH')).resolve()
	if not p.is_dir():
		return logging.error('Dir not found: ' + str(p))
	data = []
	for year in range(dt_from.year, dt_to.year + 1):
		p = next(p.glob(str(year) + '[cC]'), None)
		if not p: continue
		p = next((d for d in p.iterdir() if d.name.upper().endswith(station)), None)
		if not p:
			logging.debug(f'Neutron: Not found NM station: {year}/{station}')
			continue
		for month in range(1 if year != dt_from.year else dt_from.month, 13 if year != dt_to.year else dt_to.month + 1):
			files = p.glob(f'{year%100:02}{month:02}*')
			p = next((f for f in files if f.suffix and f.suffixes[0].upper() in ['.C0C', '.60C']), None)
			if not p:
				logging.debug(f'Neutron: Not found NM counts file: {year}/{station}/{month}')
				continue
			try:
				with open(p) as file:
					if '.C0C' in p.name.upper():
						for i in range(7):
							next(file) # skip comment
						time_cursor = datetime(year, month, 1)
						while time_cursor.month == month:
							line = next(file, None)
							for cnt in line.split()[:12]:
								data.append((time_cursor, float(cnt))) # imp/min
								time_cursor += timedelta(hours=1)
							assert len(data) % 12 == 0
					else: # if .60c.txt
						for i in range(2):
							next(file) # skip header
						for line in file:
							date = datetime.strptime(line[:19], '%Y-%m-%d %H:%M:%S')
							cnt = float(line[24:].strip()) * 60 # Hz => imp/min
							data.append((date, cnt))
			except Exception as e:
				logging.warn(f'Failed to parse {p}: {e}')
	
	log.debug(f'Neutron: obtain local:{station} [{len(data)}] {dt_from} to {dt_to}')
	query = f'''INSERT INTO neutron_counts (station, time, original)
		SELECT \'{station}\', * FROM (VALUES %s) v
		ON CONFLICT (time, station) DO UPDATE SET obtain_time = CURRENT_TIMESTAMP, original = EXCLUDED.original'''
	psycopg2.extras.execute_values(pg_cursor, query, data, template='(%s, %s::real)')

def _fetch_one(interval, station):
	with pg_conn.cursor() as cursor:
		if pg_conn.status == psycopg2.extensions.STATUS_IN_TRANSACTION:
			pg_conn.rollback()
		# TODO: optionally mark all records older than certain time as bad
		try:
			cursor.execute(integrity_query(interval, PERIOD, 'neutron_counts', 'obtain_time', where=f'station=\'{station}\'',
				bad_condition=f'original IS NULL AND \'now\'::timestamp - obtain_time > \'{PERIOD} s\'::interval', bad_cond_columns=['original']))
			if gaps := cursor.fetchall():
				for gap in gaps:
					# FIXME: this is very dumb and weird
					if gap[0] >= datetime(datetime.now().year, 1, 1).timestamp():
						_obtain_nmdb(gap, station, cursor)
					else:
						_obtain_local(gap, station, cursor)
				pg_conn.commit()
			cursor.execute(f'''SELECT COALESCE(corrected, original) FROM generate_series(to_timestamp(%s),to_timestamp(%s),'%s s'::interval) ts
			LEFT JOIN neutron_counts n ON ts=n.time AND station=%s''', [*interval, PERIOD, station])
		except psycopg2.errors.InFailedSqlTransaction:
			pg_conn.rollback()
			log.warning(f'Neutron: InFailedSqlTransaction, rolling back')
			_fetch_one(interval, station)
		except Exception as e:
			log.error(f'Failed to fetch {station}: {e}')
		return numpy.array(cursor.fetchall(), dtype=numpy.float32)

def fetch(interval: [int, int], stations: list[str]):
	trim_future = datetime.now().timestamp() // PERIOD * PERIOD
	t_from, t_to = align_interval(interval, PERIOD)
	t_to = min(trim_future - PERIOD, t_to)
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