from datetime import datetime, timezone, timedelta

import requests
from bs4 import BeautifulSoup

from database import pool, log, upsert_coverage, upsert_many
from events.table import ColumnDef as Col

URL = 'https://www.sidc.be/solardemon/science/'

FLR_TABLE = T1 = 'solardemon_flares'
DIM_TABLE = T2 = 'solardemon_dimmings'
FLR_COLS = [
	Col(T1, 'id', sql='id integer PRIMARY KEY'),
	Col(T1, 'dimming_id', data_type='integer'),
	Col(T1, 'start_time', not_null=True, data_type='time', pretty_name='start'),
	Col(T1, 'peak_time', not_null=True, data_type='time', pretty_name='peak'),
	Col(T1, 'end_time', not_null=True, data_type='time', pretty_name='end'),
	Col(T1, 'class', data_type='text'),
	Col(T1, 'lat'),
	Col(T1, 'lon'),
	Col(T1, 'dist', description='dist, R☉'),
	Col(T1, 'active_region', data_type='integer', pretty_name='AR'),
	Col(T1, 'flux'),
	Col(T1, 'goes_flux', pretty_name='GOES flux'),
	Col(T1, 'goes_peak_time', data_type='time', pretty_name='GOES peak'),
	Col(T1, 'detection_number', pretty_name='detections'),
]
DIM_COLS = [
	Col(T2, 'id', sql='id integer PRIMARY KEY'),
	Col(T2, 'flare_id', data_type='integer'),
	Col(T2, 'start_time', not_null=True, data_type='time', pretty_name='start'),
	Col(T2, 'peak_time', not_null=True, data_type='time', pretty_name='peak'),
	Col(T2, 'end_time', not_null=True, data_type='time', pretty_name='end'),
	Col(T2, 'intensity'),
	Col(T2, 'max_drop'),
	Col(T2, 'lat'),
	Col(T2, 'lon'),
	Col(T2, 'dist', description='dist, R☉'),
	Col(T2, 'active_region', data_type='integer', pretty_name='AR'),
	Col(T2, 'image_count', pretty_name='count'),
]

def _init():
	with pool.connection() as conn:
		for col, tbl in [(DIM_COLS, DIM_TABLE), (FLR_COLS, FLR_TABLE)]:
			cols = ',\n'.join([c.sql for c in col if c])
			query = f'CREATE TABLE IF NOT EXISTS events.{tbl} (\n{cols})'
			conn.execute(query)
_init()

def scrape_solardemon(what, days):
	log.debug('Scraping solardemon %s for %s days', what, days)

	url = f'{URL}{what}.php?days={days}&science=1&dimming_threshold=-100000&min_flux_est=0.000001'
	res = requests.get(url, timeout=10)

	if res.status_code != 200:
		log.error('Failed loading %s: HTTP %s', url, res.status_code)
		raise Exception('Request failed')

	soup = BeautifulSoup(res.text, 'html.parser')

	data = []
	cur_date = None
	for tr in soup.find_all('table')[-1].find_all('tr')[1:]:
		tds = tr.find_all('td')
		if len(tds) < 2:
			cur_date = datetime.strptime(tds[0].text, '%B, %Y').date()
			continue
		vals = [td.get_text(strip=True).replace('&nbsp', '') for td in tds] # nbsp part is quite funny right

		cur_date = cur_date.replace(day=int(vals[0]))

		times = [datetime.combine(cur_date, datetime.strptime(t, '%H:%M').time(),
			timezone.utc) for t in vals[2:5]]
		for i in range(1, 3):
			if times[i] < times[0]:
				times[i] += timedelta(days=1)
		
		ar_text = vals[9 if what == 'flares' else 10]
		ar = int(ar_text.split()[-1]) if ar_text else None
		iid = int(vals[5])

		if what == 'flares':
			cl = vals[1]
			lat, lon, dist, fl, gfl, det = (None if not vals[i] or vals[i] in ['N/A', 'not']
				else float(vals[i].replace(',', '')) for i in [6, 7, 8, 10, 11, 15])
			dim_a = tds[-1].find('a')
			dim_id = dim_a and int(dim_a['href'].split('did=')[-1])
			
			goes_peak = None
			if vals[12] and vals[12] not in ['N/A', 'in range']:
				gtm = datetime.strptime(vals[12], '%H:%M').time()
				goes_peak = datetime.combine(cur_date, gtm, timezone.utc)
				if goes_peak < times[0]:
					goes_peak += timedelta(days=1)

			data.append((iid, dim_id, *times, cl, lat, lon, dist, ar, fl, gfl, goes_peak, det))

		elif what == 'dimmings':
			tens, drop, lat, lon, dist, cnt = (None if not vals[i] or vals[i] == 'N/A'
				else float(vals[i].replace(',', '')) for i in [1, 6, 7, 8, 9, 11])
			flr_a = tds[-1].find('a')
			flr_id = flr_a and int(flr_a['href'].split('fid=')[-1])

			data.append((iid, flr_id, *times, tens, drop, lat, lon, dist, ar, cnt))
	
	log.info('Upserting [%s] solardemon %s for %s days', len(data), what, str(days))
	cols, tbl = (FLR_COLS, FLR_TABLE) if what == 'flares' else (DIM_COLS, DIM_TABLE)
	upsert_many('events.'+tbl, [c.name for c in cols], data, conflict_constraint='id')
	upsert_coverage(tbl, data[-1][2], data[0][2], single=True)

def fetch(entity, month):
	now = datetime.now(timezone.utc)
	days = max(min(int((now - month).total_seconds() / 86400) + 33, 999), 10)
	scrape_solardemon(entity, days)
