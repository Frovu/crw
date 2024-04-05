from datetime import datetime, timezone

import re, requests
from bs4 import BeautifulSoup

from database import pool, log, upsert_many, upsert_coverage
from events.table import ColumnDef as Col

TABLE = 'r_c_icmes'
URL = 'https://izw1.caltech.edu/ACE/ASC/DATA/level3/icmetable2.htm'
COLS = [
	Col(TABLE, 'time',
		not_null=True, data_type='time',
		description='Disturbance onset: SSC or IPS or estimated time'),
	Col(TABLE, 'body_start',
		not_null=True, data_type='time',
		pretty_name='start',
		description='Estimated start time based on plasma and magnetic field observations'),
	Col(TABLE, 'body_end',
		not_null=True, data_type='time',
		pretty_name='end',
		description='Estimated end time based on plasma and magnetic field observations'),
	Col(TABLE, 'quality',
		not_null=True, data_type='integer',
		pretty_name='qual',
		description='The "quality" of the boundary times (1 indicating the most reliable)'),
	Col(TABLE, 'mc_index',
		not_null=True, data_type='integer',
		pretty_name='MC',
		description='2: MC reported; 1: ICME shows evidence of a rotation in field direction; 0: No MC reported'),
	Col(TABLE, 'cmes_time',
		not_null=True, data_type='timestamptz[]',
		pretty_name='DONKI time',
		description='Probable CMEs associated with the ICME from LASCO catlogue and/or CCMC DONKI')
]

def _init():
	cols = ',\n'.join([c.sql for c in COLS if c])
	query = f'CREATE TABLE IF NOT EXISTS events.{TABLE} (\n{cols}, UNIQUE(time))'
	with pool.connection() as conn:
		conn.execute(query)
_init()

def parse_date(s):
	return datetime.strptime(s[:15], '%Y/%m/%d %H%M').replace(tzinfo=timezone.utc)

def fetch():
	res = requests.get(URL, timeout=10)

	if res.status_code != 200:
		log.error('Failed loading R&C catalogue: HTTP %s', res.status_code)
		raise Exception('Failed to load')

	soup = BeautifulSoup(res.text, 'html.parser')
	data = []
	time_re = re.compile(r'\d{4}[/ ]\d?\d/\d?\d|\d{4}')

	for tr in [tr for tr in soup.find_all('tr') if 'Disturbance' not in tr.text]:
		vals = [td.get_text(strip=True) for td in tr.find_all('td')]
		if len(vals) < 15:
			continue
		ons, start, end = [parse_date(v) for v in vals[:3]]
		qual, mc = int(vals[9][0]), int(vals[14][0])

		cmes = []
		cur = ''
		for part in time_re.findall(vals[-1]):
			if len(part) > 4:
				cur = part.replace(' ', '/')
			else:
				pts = (*cur.split('/'), part[:2], part[2:])
				cmes.append(datetime(*[int(p) for p in pts], tzinfo=timezone.utc))
			
		data.append((ons, start, end, qual, mc, cmes))

	log.info('Upserting [%s] R&C ICMEs', len(data))
	upsert_many('events.'+TABLE, [c.name for c in COLS], data)
	upsert_coverage(TABLE, data[0][0], data[-1][0], single=True)
