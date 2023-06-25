import os, logging, pymysql.cursors, numpy
from threading import Timer
from datetime import datetime, timedelta
from pathlib import Path

from data_series.util import integrity_query, align_interval
from core.database import pool, upsert_many

log = logging.getLogger('aides')

obtain_cache = dict()
PERIOD = 3600
nmdb_conn = None
discon_timer = None

def _init():
	with open(os.path.join(os.path.dirname(__file__), './database_init.sql')) as file:
		init_text =  file.read()
	with pool.connection() as conn:
		conn.execute(init_text)
		station_ids = [r[0] for r in conn.execute('SELECT id FROM neutron_stations').fetchall()]
		for station in station_ids:
			conn.execute(f'ALTER TABLE neutron_counts ADD COLUMN IF NOT EXISTS {station} REAL')
			conn.execute(f'ALTER TABLE neutron_counts_corrections ADD COLUMN IF NOT EXISTS {station} REAL')
		
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

def _obtain_nmdb(interval, stations):
	_connect_nmdb()
	log.debug(f'Neutron: querying nmdb')
	dt_interval = [datetime.utcfromtimestamp(t) for t in interval]
	query = f'''
WITH RECURSIVE ser(time) AS (
	SELECT TIMESTAMP(%(from)s) UNION ALL 
	SELECT DATE_ADD(time, INTERVAL 1 hour) FROM ser WHERE time < %(to)s)
SELECT ser.time, {", ".join([st + '.val' for st in stations])} FROM ser\n'''
	for station in stations:
		query += f'''LEFT OUTER JOIN
(SELECT date_add(date(start_date_time), interval extract(hour from start_date_time) hour) as time, round(avg(corr_for_efficiency), 4) as val
	FROM {station}_revori WHERE start_date_time >= %(from)s AND start_date_time < %(to)s + interval 1 hour
	GROUP BY date(start_date_time), extract(hour from start_date_time)) {station} ON {station}.time = ser.time\n'''
	with nmdb_conn.cursor() as curs:
		curs.execute(query, {'from': dt_interval[0], 'to': dt_interval[1]})
		try:
			curs.execute(query, {'from': dt_interval[0], 'to': dt_interval[1]})
		except:
			log.warning('Failed to query nmdb, disconnecting')
			return _disconnect_nmdb()
		data = curs.fetchall()
		
	log.debug(f'Neutron: obtained nmdb [{len(data)} * {len(stations)}] {dt_interval[0]} to {dt_interval[1]}')
	if data:
		upsert_many('neutron_counts', ['time', *stations], data)

def _obtain_local(interval, stations):
	dt_from, dt_to = [datetime.utcfromtimestamp(t) for t in interval]
	dirp = Path(os.environ.get('NM_C_PATH')).resolve()
	if not dirp.is_dir():
		return logging.error('Dir not found: ' + str(dirp))
	data = dict()
	for station_i, station in enumerate(stations):
		def add_count(date, count):
			if date not in data:
				data[date] = [None for s in stations]
			data[date][station_i] = count
		for year in range(dt_from.year, dt_to.year + 1):
			p = next(dirp.glob(str(year) + '[cC]'), None)
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
									add_count(time_cursor, float(cnt)) # imp/min
									time_cursor += timedelta(hours=1)
								assert len(data) % 12 == 0
						else: # if .60c.txt
							for i in range(2):
								next(file) # skip header
							for line in file:
								date = datetime.strptime(line[:19], '%Y-%m-%d %H:%M:%S')
								cnt = float(line[24:].strip()) * 60 # Hz => imp/min
								add_count(date, cnt)
				except Exception as e:
					logging.warn(f'Failed to parse {p}: {e}')

	data = [[date, *data[date]] for date in data]
	log.debug(f'Neutron: obtained local [{len(data)} * {len(stations)}] {dt_from} to {dt_to}')
	if data:
		upsert_many('neutron_counts', ['time', *stations], data)

def fetch(interval: [int, int], stations: list[str]):
	trim_future = int(datetime.now().timestamp()) // PERIOD * PERIOD
	interval = (interval[0], min(trim_future - PERIOD, interval[1]))
	interval = align_interval(interval, PERIOD)

	# FIXME: better cache system
	key = (*interval, *stations)
	if key not in obtain_cache:
		if interval[1] >= datetime(datetime.now().year, 1, 1).timestamp(): # FIXME: meh
			_obtain_nmdb(interval, stations)
		else:
			_obtain_local(interval, stations)
		obtain_cache[key] = True
	
	with pool.connection() as conn:
		rows = conn.execute(f'''SELECT EXTRACT(EPOCH FROM ts)::integer as time,
{', '.join([f'COALESCE(corr.{st}, ori.{st}) as {st}' for st in stations])}
FROM generate_series(to_timestamp(%s), to_timestamp(%s), '{PERIOD} s'::interval) ts
LEFT JOIN neutron_counts ori ON ts=ori.time
LEFT JOIN neutron_counts_corrections corr ON ts=corr.time''', [*interval]).fetchall()
	return numpy.array(rows, dtype='f8')

def select_stations():
	with pool.connection() as conn:
		return conn.execute('SELECT id, drift_longitude, closed_at FROM neutron_stations').fetchall()