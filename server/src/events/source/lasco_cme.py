from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

from database import pool, log, upsert_many
from events.table import ColumnDef as Col

TABLE = 'lasco_cmes'
URL = 'https://cdaw.gsfc.nasa.gov/CME_list/UNIVERSAL_ver1/'
EPOCH = (1996, 1)
COLS = [
	None,
	Col(TABLE, 'time', not_null=True, data_type='time', description='First LASCO/C2 appearance'),
	Col(TABLE, 'central_angle', pretty_name='CPA', description='Central Position Angle, deg'),
	Col(TABLE, 'angular_width', pretty_name='width', description='Angular Width, deg'),
	Col(TABLE, 'linear_speed', pretty_name='speed linear', description='Linear Speed, km/s'),
	Col(TABLE, 'speed_2', pretty_name='speed', description='2nd-order Speed at final height, km/s'),
	Col(TABLE, 'speed_2_20rs', pretty_name='speed 20rs', description='2nd-order Speed at 20 Rs, km/s'),
	Col(TABLE, 'acceleration', pretty_name='accel', description='Acceleration, m/s^2'),
	Col(TABLE, 'mass', description='Mass, gram'),
	Col(TABLE, 'kinetic_energy', description='Kinetic Energy, erg'),
	Col(TABLE, 'measurement_angle', pretty_name='MPA', description='Measurement Position Angle, deg'),
	None,
	Col(TABLE, 'remarks', data_type='text')
]

def _init():
	cols = ',\n'.join([c.sql for c in COLS if c])
	query = f'CREATE TABLE IF NOT EXISTS events.{TABLE} (\n{cols}, UNIQUE(time, central_angle, linear_speed))'
	with pool.connection() as conn:
		conn.execute(query)
_init()

def scrape_month(year, month):
	mon = f'{year}_{month:02}'
	res = requests.get(f'{URL}{mon}/univ{mon}.html', timeout=10)

	if res.status_code == 404:
		log.debug('LASCO CME page not found: %s', mon)
		return None
	elif res.status_code != 200:
		log.error('LASCO CME failed: HTTP %s', res.status_code)
		raise Exception('Failed to load')

	soup = BeautifulSoup(res.text, 'html.parser')
	cols = [c.name for c in COLS if c]
	data = []

	for tr in soup.find_all('tr'):
		vals = [td.text for td in tr.find_all('td')]
		if len(vals) < 1:
			continue
		time = datetime.strptime(vals[0].strip()+vals[1].strip(), '%Y/%m/%d%H:%M:%S').replace(tzinfo=timezone.utc)
		res = [time, *[None if '***' in v or '--' in v or 'Halo' in v else
			float(v.replace('>', '').split('*')[0].strip()) for v in vals[2:-2]], vals[-1].strip()]
		assert len(res) == len(cols)
		data.append(res)

	log.info('Upserting [%s] LASCO CMEs for %s', len(data), mon)
	upsert_many('events.'+TABLE, cols, data, conflict_constraint='time, central_angle, linear_speed')
	
def scrape_all():
	year, month = EPOCH
	now = datetime.utcnow()
	to_year, to_month = now.year, now.month
	while year < to_year or (year == to_year and month < to_month):
		scrape_month(year, month)
		month += 1
		if month > 12:
			month = 1
			year += 1
