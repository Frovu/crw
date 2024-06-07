from datetime import datetime, timezone, timedelta

import requests
from bs4 import BeautifulSoup

from database import pool, log, upsert_many, get_coverage, upsert_coverage
from events.table_structure import ColumnDef as Col
from events.source.donki import parse_coords

TABLE = 'lasco_cmes'
TABLE_HT = 'lasco_cmes_ht'
HALO_ENT = 'lasco_cmes_halo'
URL = 'https://cdaw.gsfc.nasa.gov/CME_list/UNIVERSAL_ver2/'
HALO_URL = 'https://cdaw.gsfc.nasa.gov/CME_list/halo/halo.html'
EPOCH = (1996, 1)
COLS = [ # ORDERED !!!
	Col(TABLE, 'time', not_null=True, data_type='time', description='First LASCO/C2 appearance'),
	Col(TABLE, 'central_angle', pretty_name='CPA', description='Central Position Angle, deg'),
	Col(TABLE, 'angular_width', pretty_name='width', description='Angular Width, deg'),
	Col(TABLE, 'speed', pretty_name='speed linear', description='Linear Speed, km/s'),
	Col(TABLE, 'speed_2', pretty_name='speed 2', description='2nd-order Speed at final height, km/s'),
	Col(TABLE, 'speed_2_20rs', pretty_name='speed 2 20r', description='2nd-order Speed at 20 Rs, km/s'),
	Col(TABLE, 'acceleration', pretty_name='accel', description='Acceleration, m/s^2'),
	Col(TABLE, 'mass', description='Mass, gram'),
	Col(TABLE, 'kinetic_energy', pretty_name='E', description='Kinetic Energy, erg'),
	Col(TABLE, 'measurement_angle', pretty_name='MPA', description='Measurement Position Angle, deg'),
	Col(TABLE, 'note', data_type='text'),
	Col(TABLE, 'space_speed', pretty_name='space speed'),
	Col(TABLE, 'lat'),
	Col(TABLE, 'lon'),
	Col(TABLE, 'flare_class', data_type='text'),
	Col(TABLE, 'flare_onset', data_type='text'),
]
TABLE_COLS = ['time', 'central_angle', 'angular_width', 'speed', 'speed_2', 'speed_2_20rs',
	'acceleration', 'mass', 'kinetic_energy', 'measurement_angle', 'note']
HALO_COLS = ['time', 'speed', 'space_speed', 'acceleration', 'measurement_angle',
	'flare_class', 'flare_onset', 'lat', 'lon']
assert all(c.name in (TABLE_COLS + HALO_COLS) for c in COLS)

def _init():
	cols = ',\n'.join([c.sql for c in COLS if c])
	query = f'CREATE TABLE IF NOT EXISTS events.{TABLE} (\n{cols}, '+\
		' UNIQUE NULLS NOT DISTINCT(time, speed, measurement_angle))'
	query2 = f'CREATE TABLE IF NOT EXISTS events.{TABLE_HT} (\n' +\
		'cme_time timestamptz, cme_mpa real, time timestamptz, height real)'
	
	with pool.connection() as conn:
		conn.execute(query)
		conn.execute(query2)
_init()

def scrape_halo():
	log.debug('Loading LASCO HALO CMEs')
	res = requests.get(HALO_URL, timeout=10)

	if res.status_code != 200:
		log.error('LASCO CME failed: HTTP %s', res.status_code)
		raise Exception('Failed to load')

	soup = BeautifulSoup(res.text, 'html.parser')
	data = []

	for tr in soup.find_all('table')[1].find_all('tr'):
		vals = [td.text for td in tr.find_all('td')]
		if len(vals) < 1:
			continue
		time = datetime.strptime(vals[0].strip()+vals[1].strip(), '%Y/%m/%d%H:%M:%S').replace(tzinfo=timezone.utc)
		numbers = [None if '***' in v or '--' in v or 'Halo' in v else
			float(v.replace('>', '').split('*')[0].strip()) for v in vals[2:6]]
		loc = vals[6]
		if 'ackside' in loc or loc.endswith('b'):
			lat, lon = None, None
		else:
			lat, lon = parse_coords(loc)
		strs = [None if '--' in v else v for v in vals[7:9]]
		res = [time, *numbers, *strs, lat, lon]
		data.append(res)

	log.info('Upserting [%s] LASCO HALO CMEs', len(data))
	upsert_many('events.'+TABLE, HALO_COLS, data, conflict_constraint='time, speed, measurement_angle')
	upsert_coverage(HALO_ENT, data[0][0], data[-1][0], single=True)

def scrape_month(month: datetime):
	mon = f'{month.year}_{month.month:02}'
	log.debug('Loading LASCO CMEs for %s', mon)
	res = requests.get(f'{URL}{mon}/univ{mon}.html', timeout=10)

	if res.status_code == 404:
		log.debug('LASCO CME page not found: %s', mon)
		return
	if res.status_code != 200:
		log.error('LASCO CME failed: HTTP %s', res.status_code)
		raise Exception('Failed to load')

	soup = BeautifulSoup(res.text, 'html.parser')
	data = []

	for tr in soup.find_all('tr'):
		vals = [td.text for td in tr.find_all('td')]
		if len(vals) < 1:
			continue
		time = datetime.strptime(vals[0].strip()+vals[1].strip(), '%Y/%m/%d%H:%M:%S').replace(tzinfo=timezone.utc)
		res = [time, *[None if '***' in v or '--' in v or 'Halo' in v else
			float(v.replace('>', '').split('*')[0].strip()) for v in vals[2:-2]], vals[-1].strip()]
		assert len(res) == len(TABLE_COLS)
		data.append(res)

	log.info('Upserting [%s] LASCO CMEs for %s', len(data), mon)
	upsert_many('events.'+TABLE, TABLE_COLS, data, conflict_constraint='time, speed, measurement_angle')
	upsert_coverage(TABLE, month)

	halo_covg = get_coverage(HALO_ENT)
	if len(halo_covg) < 1 or halo_covg[0][1] < data[-1][0]:
		scrape_halo()

def fetch(progr, month):
	prev_month = (month - timedelta(days=1)).replace(day=1)

	progr[1] = 2
	scrape_month(month)
	progr[0] = 1
	scrape_month(prev_month)

def fetch_height_time(conn, time, width: int, spd: int, mpa: int):
	ht = conn.execute(f'SELECT EXTRACT(EPOCH FROM time)::integer, height FROM events.{TABLE_HT} '+\
		'WHERE cme_time = %s AND cme_mpa = %s ORDER BY time', [time, mpa]).fetchall()
	if len(ht) > 0:
		return ht
	y, m, d = time.year, time.month, time.day
	hh, mm, ss = time.hour, time.minute, time.second
	letter = 'h' if width >= 360 else 'p' if width > 120 else 'n'
	url = f'{URL}{y}_{m:02}/yht/{y}{m:02}{d:02}.{hh:02}{mm:02}{ss:02}.w{width:03}{letter}.v{spd:04}.p{mpa:03}g.yht'
	log.debug('Obtaining LASCO CME height-time for %s %s/%s', time, spd, mpa)
	try:
		res = requests.get(url, timeout=5)
		if res.status_code != 200:
			raise Exception('HTTP: '+str(res.status_code))
		result = []
		for line in res.text.splitlines():
			if line.startswith('#'):
				continue
			h, dt, tm = line.strip().split()[:3]
			tstmp = datetime.strptime(dt+tm, '%Y/%m/%d%H:%M:%S').replace(tzinfo=timezone.utc)
			result.append((tstmp, float(h)))
		
		upsert_many(f'events.{TABLE_HT}', ['cme_time', 'cme_mpa', 'time', 'height'], result, constants=[time, mpa], do_nothing=True)
		return result
	except Exception as e:
		log.error('Failed to obtain LASCO CME HT: %s', str(e))
		return []

def plot_height_time(t_from, t_to):
	with pool.connection() as conn:
		curs = conn.execute('SELECT time, angular_width, speed, measurement_angle '+\
			f' FROM events.{TABLE} WHERE to_timestamp(%s) <= time AND time <= to_timestamp(%s)', [t_from, t_to])
		result = []
		for time, width, spd, mpa in curs.fetchall():
			ht = fetch_height_time(conn, time, int(width), int(spd), int(mpa))
			result.append({
				'time': time.timestamp(),
				'width': width,
				'speed': spd,
				'mpa': mpa,
				'ht': ht
			})
		return result