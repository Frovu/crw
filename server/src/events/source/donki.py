from datetime import datetime, timezone, timedelta

import re, requests

from database import pool, log, upsert_coverage, upsert_many
from events.table import ColumnDef as Col

URL = 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/'
CME_TABLE = T1 = 'donki_cmes'

CME_COLS = [
	Col(T1, 'time', not_null=True, data_type='time', description='CME start time'),
	Col(T1, 'id', sql='id integer PRIMARY KEY'),
	Col(T1, 'event_id', data_type='text'),
	Col(T1, 'time_21_5', pretty_name='time 21.5', data_type='time'),
	Col(T1, 'lat'),
	Col(T1, 'lon'),
	Col(T1, 'half_width', pretty_name='width/2'),
	Col(T1, 'speed'),
	Col(T1, 'type', data_type='text'),
	Col(T1, 'data_level', data_type='integer', pretty_name='level', description='0=real-time, 1=real-time and checked by supervising forecaster, 2=retrospective science level data analysis'),
	Col(T1, 'note', data_type='text'),
	Col(T1, 'linked_events', data_type='text[]'),
	Col(T1, 'enlil_id', data_type='integer'),
	Col(T1, 'enlil_est_shock', pretty_name='est impact', data_type='time', description='Estimated Earth arrival time'),
	Col(T1, 'enlil_filename', data_type='text'),
]

def _init():
	cols = ',\n'.join([c.sql for c in CME_COLS if c])
	query = f'CREATE TABLE IF NOT EXISTS events.{CME_TABLE} (\n{cols})'
	with pool.connection() as conn:
		conn.execute(query)
_init()

def next_month(m_start):
	end = m_start + timedelta(days=31)
	return end - timedelta(days=end.day - 1)

def parse_time(txt):
	return datetime.strptime(txt, '%Y-%m-%dT%H:%MZ').replace(tzinfo=timezone.utc)

def scrape_enlil_filename(link):
	log.debug('Resolving %s', link)
	try:
		res = requests.get(link, timeout=10)
		if res.status_code != 200:
			raise Exception('HTTP '+str(res.status_code))
		m = re.search(r'downloads/(.+?(?=\.[^\d]))', res.text)
		return m and m[1]
	except Exception as e:
		log.error('Failed resolving ENLIL: %s', str(e))
		return None
	
def obtain_cmes_month(month_start: datetime):
	month_next = next_month(month_start)
	s_str = month_start.strftime('%Y-%m-%d')
	e_str = (month_next - timedelta(days=1)).strftime('%Y-%m-%d')
	url = f'{URL}WS/get/CME?startDate={s_str}&endDate={e_str}'
	log.debug('Loading DONKI CMEs for %s', str(month_start).split()[0])
	res = requests.get(url, timeout=10)

	if res.status_code != 200:
		log.error('Failed loading %s: HTTP %s', url, res.status_code)
		raise Exception('Failed loading')

	data = []
	for cme in res.json():
		time = parse_time(cme['startTime'])
		iid = int(cme['link'].split('/')[-2])
		aid, note = cme['activityID'], cme['note']
		linked = [e['activityID'] for e in cme['linkedEvents'] or []]

		an = next((a for a in cme['cmeAnalyses'] if a['isMostAccurate']), None)
		if not an:
			log.debug('DONKI CME without analysis: %s', cme['link'])
			continue
		
		vals = (an[k] for k in ['time21_5', 'latitude', 'longitude', 'halfAngle', 'speed', 'type', 'levelOfData'])
		enlil = next((m for m in (an['enlilList'] or [])[::-1] if m['au'] == 2), None)
		e_shock = enlil and enlil['estimatedShockArrivalTime']
		e_id = enlil and int(enlil['link'].split('/')[-2])
		e_fname = None
		
		data.append([time, iid, aid, *vals, note, linked, e_id, e_shock, e_fname])

	log.info('Upserting [%s] DONKI CMEs for %s', len(data), str(month_start).split()[0])
	upsert_many('events.'+CME_TABLE, [c.name for c in CME_COLS], data, conflict_constraint='id')
	upsert_coverage(CME_TABLE, month_start, month_next)
