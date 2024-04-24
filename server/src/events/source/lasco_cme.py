from datetime import datetime, timezone, timedelta

import requests
from bs4 import BeautifulSoup

from database import pool, log, upsert_many, get_coverage, upsert_coverage
from events.table_structure import ColumnDef as Col
from events.source.donki import parse_coords

TABLE = 'lasco_cmes'
HALO_ENT = 'lasco_cmes_halo'
URL = 'https://cdaw.gsfc.nasa.gov/CME_list/UNIVERSAL_ver1/'
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
	query = f'CREATE TABLE IF NOT EXISTS events.{TABLE} (\n{cols}, UNIQUE NULLS NOT DISTINCT(time, speed, measurement_angle))'
	with pool.connection() as conn:
		conn.execute(query)
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