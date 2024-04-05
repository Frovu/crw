
from datetime import datetime, timezone, timedelta

import os, re, requests

from database import pool, log, upsert_coverage, upsert_many
from events.table import ColumnDef as Col
from events.source.donki import parse_coords

URL = 'https://www.lmsal.com/solarsoft/'

TABLE = 'solarsoft_flares'
COLS = [
	Col(TABLE, 'start_time', not_null=True, sql='start_time timestamptz PRIMARY KEY', pretty_name='start'),
	Col(TABLE, 'peak_time', not_null=True, data_type='time', pretty_name='peak'),
	Col(TABLE, 'end_time', not_null=True, data_type='time', pretty_name='end'),
	Col(TABLE, 'class', data_type='text'),
	Col(TABLE, 'lat'),
	Col(TABLE, 'lon'),
	Col(TABLE, 'active_region', data_type='integer', pretty_name='AR')
]

def _init():
	with pool.connection() as conn:
		cols = ',\n'.join([c.sql for c in COLS])
		query = f'CREATE TABLE IF NOT EXISTS events.{TABLE} (\n{cols})'
		conn.execute(query)
_init()

last_fetched = datetime.now(timezone.utc)

def parse_time(txt):
	return datetime.strptime(txt, '%Y/%m/%d %H:%M').replace(tzinfo=timezone.utc)

def fetch_archive_page():
	global last_fetched
	fname = 'tmp/solarsoft_archive.html'
	now = datetime.now(timezone.utc)
	if os.path.exists(fname) and last_fetched \
			and last_fetched - now < timedelta(hours=3):
		with open(fname, encoding='utf-8') as f:
			return f.read()
	
	url = URL + 'latest_events_archive.html'
	res = requests.get(url, timeout=20)

	if res.status_code != 200:
		log.error('Failed loading %s: HTTP %s', url, res.status_code)
		raise Exception('Request failed')

	with open(fname, 'w', encoding='utf-8') as f:
		f.write(res.text)
	log.debug('Downloaded solarsoft archive page')
	last_fetched = now
	return res.text

def _scrape_flares(progr, dt_start, dt_end):
	log.debug('Scraping solarsoft flares from %s to %s', str(dt_start).split()[0], str(dt_end).split()[0])
	text = fetch_archive_page()

	archive_re = re.compile(r'A HREF="(.+?)".+?<td>([^<]+).+?<td>([^<]+)', re.MULTILINE | re.DOTALL)
	data = {}
	links = []

	for match in archive_re.findall(text):
		link, first, last = match
		if '-' in first:
			continue
		first, last = (parse_time(t) for t in [first, last])

		if first > dt_end:
			continue
		if last < dt_start:
			break
		links.append((link, first))

	for link, first in links:
		log.debug('Loading solarsoft last_events > %s', first)
		url = URL + link
		res = requests.get(url, timeout=10)

		if res.status_code != 200:
			log.error('Failed loading %s: HTTP %s', url, res.status_code)
			raise Exception('Request failed')

		chunk = res.text.split('<table')[-1]
		for tr in chunk.split('<tr')[2:]:
			strt, stop, peak, cl, pos = [td.split('</td>')[0] for td in tr.split('<td>')[3:]]

			start = datetime.strptime(strt, '%Y/%m/%d %H:%M:%S').replace(tzinfo=timezone.utc)

			if start in data:
				continue

			stop, peak = (datetime.strptime(t, '%H:%M:%S').time() for t in [stop, peak])
			stop_date = (start + timedelta(days=1)).date() if stop < start.time() else start.date()
			peak_date = (start + timedelta(days=1)).date() if peak < start.time() else start.date()
			stop = datetime.combine(stop_date, stop)
			peak = datetime.combine(peak_date, peak)

			coords = re.search(r'(S|N)[\dWE]{4,6}', pos)[0]
			lat, lon = parse_coords(coords)
			m = re.search(r'region=(\d+)', pos)
			ar = None if '(  )' in pos else m and int(m[1])

			data[start] = [start, peak, stop, cl, lat, lon, ar]
		progr[0] += 100 / len(links)
	
	log.info('Upserting [%s] solarsoft FLRs from %s', len(data), str(dt_start).split()[0])
	upsert_many('events.'+TABLE, [c.name for c in COLS], list(data.values()), conflict_constraint='start_time')
	upsert_coverage(TABLE, dt_start)

def fetch(progr, entity, month):
	next_month = (month + timedelta(days=31)).replace(day=1)
	prev_month = (month - timedelta(days=1)).replace(day=1)

	assert entity == 'flares'
	progr[1] = 200
	_scrape_flares(progr, month, next_month)
	_scrape_flares(progr, prev_month, month)