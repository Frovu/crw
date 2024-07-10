from datetime import datetime, timezone, timedelta

import re, requests
from bs4 import BeautifulSoup

from database import pool, log, upsert_many, upsert_coverage
from events.table_structure import ColumnDef as Col

CH_URL = 'https://solen.info/solar/coronal_holes.html'

TABLE = 'solen_holes'
COLS = [
	Col(TABLE, 'tag', sql='tag text PRIMARY KEY', data_type='text',
		description='STAR Coronal hole tag'),
	Col(TABLE, 'time',
		not_null=True, data_type='time',
		description='Earth facing position date'),
	Col(TABLE, 'polarity',
		not_null=True, data_type='text'),
	Col(TABLE, 'location',
		not_null=True, data_type='text',
		pretty_name='loc'),
	Col(TABLE, 'comment',
		not_null=True, data_type='text'),
	Col(TABLE, 'disturbance_time',
		data_type='time',
		pretty_name='est. disturb',
		description='Estimated geomagnetic disturbance date'),
]

date_re = re.compile(r'([12]\d{3})\.(\d\d)\.(\d\d)')

def _init():
	cols = ',\n'.join([c.sql for c in COLS if c])
	query = f'CREATE TABLE IF NOT EXISTS events.{TABLE} (\n{cols})'
	with pool.connection() as conn:
		conn.execute(query)
_init()

def parse_date_interv(s):
	dates = date_re.findall(s)
	if len(dates) < 1:
		return None
	dates = [datetime(*[int(p) for p in d], tzinfo=timezone.utc) for d in dates]
	if len(dates) == 1:
		return dates[0] + timedelta(hours=12)
	return (dates[1] - dates[0]) / 2 + dates[0] + timedelta(hours=12)

def fetch():
	res = requests.get(CH_URL, timeout=10)

	log.debug('Fetching solen CHs')
	if res.status_code != 200:
		log.error('Failed loading solen CH catalogue: HTTP %s', res.status_code)
		raise Exception('Failed to load')

	soup = BeautifulSoup(res.text, 'html.parser')
	data = []

	for tr in soup.find_all('tr')[1:]:
		vals = [td.get_text(strip=True) for td in tr.find_all('td')]
		tag, loc, pol, comm = vals[0], vals[1], vals[2], vals[-1]
		time, est = [parse_date_interv(vals[i]) for i in (3, 4)]

		if time is None:
			continue

		data.append((tag, time, pol, loc, comm, est))

	log.info('Upserting [%s] solen CHs', len(data))
	upsert_many('events.'+TABLE, [c.name for c in COLS], data, conflict_constraint='tag')
	upsert_coverage(TABLE, data[-1][1], data[0][1], single=True)