from datetime import datetime, timezone

import re, requests
from bs4 import BeautifulSoup

from database import log, create_table, upsert_many, upsert_coverage
from events.columns.column import Column as Col

TABLE = 'r_c_icmes'
URL = 'https://izw1.caltech.edu/ACE/ASC/DATA/level3/icmetable2.htm'
COLS = [
	Col(TABLE, 'time',
		not_null=True, dtype='time',
		description='Disturbance onset: SSC or IPS or estimated time'),
	Col(TABLE, 'body_start',
		not_null=True, dtype='time',
		name='start',
		description='Estimated start time based on plasma and magnetic field observations'),
	Col(TABLE, 'body_end',
		not_null=True, dtype='time',
		name='end',
		description='Estimated end time based on plasma and magnetic field observations'),
	Col(TABLE, 'quality',
		not_null=True, dtype='integer',
		name='qual',
		description='The "quality" of the boundary times (1 indicating the most reliable)'),
	Col(TABLE, 'mc_index',
		not_null=True, dtype='integer',
		name='MC',
		description='2: MC reported; 1: ICME shows evidence of a rotation in field direction; 0: No MC reported'),
	Col(TABLE, 'cmes_time',
		not_null=True, dtype='text', # FIXME: time[] -> text
		name='CME time',
		description='Probable CMEs associated with the ICME from LASCO catlogue and/or CCMC DONKI')
]

def _init():
	create_table(TABLE, COLS)
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
		for part in time_re.findall(vals[-1].replace('\'', '/')):
			if len(part) > 4:
				cur = part.replace(' ', '/')
			else:
				pts = (*cur.split('/'), part[:2], part[2:])
				dtm = datetime(*[int(p) for p in pts], tzinfo=timezone.utc)
				cmes.append(dtm.isoformat().split('.')[0]+'Z')
			
		data.append((ons, start, end, qual, mc, ','.join(cmes)))

	log.info('Upserting [%s] R&C ICMEs', len(data))
	upsert_many(TABLE, [c.sql_name for c in COLS], data)
	upsert_coverage(TABLE, data[0][0], data[-1][0], single=True)
