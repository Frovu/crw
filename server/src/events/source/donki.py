from datetime import datetime, timezone, timedelta

import re, os, requests

from database import pool, log, upsert_coverage, upsert_many
from events.columns.column import Column as Col

from psycopg.sql

proxy = os.environ.get('NASA_PROXY')
proxies = {
	"http": proxy,
	"https": proxy
} if proxy else { }

URL = 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/'
CME_TABLE = T1 = 'donki_cmes'
FLR_TABLE = T2 = 'donki_flares'

CME_COLS = [
	Col(T1, 'id', sql_def='integer PRIMARY KEY', dtype='integer'),
	Col(T1, 'event_id', dtype='text'),
	Col(T1, 'time', not_null=True, dtype='time', description='CME start time'),
	Col(T1, 'time_21_5', name='time 21.5', dtype='time'),
	Col(T1, 'lat'),
	Col(T1, 'lon'),
	Col(T1, 'half_width', name='width/2'),
	Col(T1, 'speed'),
	Col(T1, 'type', dtype='text'),
	Col(T1, 'data_level', dtype='integer', name='level', description='0=real-time, 1=real-time and checked by supervising forecaster, 2=retrospective science level data analysis'),
	Col(T1, 'note', dtype='text'),
	Col(T1, 'linked_events', dtype='text'), # FIXME: this was text[]
	Col(T1, 'enlil_id', name='enlil', dtype='integer'),
	Col(T1, 'enlil_est_shock', name='est impact', dtype='time', description='Estimated Earth arrival time'),
	Col(T1, 'enlil_filename', dtype='text'),
]

FLR_COLS = [
	Col(T2, 'id', sql_def='integer PRIMARY KEY', dtype='integer'),
	Col(T2, 'event_id', dtype='text'),
	Col(T2, 'start_time', not_null=True, dtype='time', name='start'),
	Col(T2, 'peak_time', dtype='time', name='peak'),
	Col(T2, 'end_time', dtype='time', name='end'),
	Col(T2, 'class', dtype='text'),
	Col(T2, 'lat'),
	Col(T2, 'lon'),
	Col(T2, 'active_region', dtype='integer', name='AR'),
	Col(T2, 'note', dtype='text'),
	Col(T2, 'linked_events', dtype='text'), # FIXME: this was text[]
]

def _init():
	with pool.connection() as conn:
		for col, tbl in [(CME_COLS, CME_TABLE), (FLR_COLS, FLR_TABLE)]:
			cols = SQL(',\n').join([c.sql_col_def() for c in col if c])
			query = SQL('CREATE TABLE IF NOT EXISTS {} (\n{})').format('events.'+tbl, )
			conn.execute(query)
_init()

coords_re = re.compile(r'(N|S)(\d{1,2})(W|E)(\d{1,3})')
coords_re_reversed = re.compile(r'(W|E)(\d{1,3})(N|S)(\d{1,2})')

def parse_coords(loc: str, reverse=False):
	m = (coords_re_reversed if reverse else coords_re).match(loc)
	if not m:
		raise ValueError('Failed to parse coords: ' + loc)
	if reverse:
		we, alon, ns, alat = m.groups()
	else:
		ns, alat, we, alon = m.groups()
	lat = (1 if ns == 'N' else -1) * int(alat)
	lon = (1 if we == 'W' else -1) * int(alon)
	return lat, lon

def next_month(m_start):
	end = m_start + timedelta(days=31)
	return end - timedelta(days=end.day - 1)

def parse_time(txt):
	tm = datetime.strptime(txt, '%Y-%m-%dT%H:%MZ').replace(tzinfo=timezone.utc)
	# https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/FLR/18563/2 had 0021-12-16 in date
	return tm.replace(year=tm.year + 2000) if tm.year < 100 else tm

def _obtain_month(what, month_start: datetime):
	month_next = next_month(month_start)
	s_str = month_start.strftime('%Y-%m-%d')
	e_str = (month_next - timedelta(days=1)).strftime('%Y-%m-%d')

	url = f'{URL}WS/get/{what}?startDate={s_str}&endDate={e_str}'
	log.debug('Loading DONKI %ss for %s', what, s_str)
	res = requests.get(url, timeout=10, proxies=proxies)

	if res.status_code != 200:
		log.error('Failed loading %s: HTTP %s', url, res.status_code)
		raise Exception('Failed loading')

	data = []

	if what == 'CME':
		table, cols = CME_TABLE, CME_COLS
		for cme in res.json():
			time = parse_time(cme['startTime'])
			iid = int(cme['link'].split('/')[-2])
			aid, note = cme['activityID'], cme['note']
			linked = [e['activityID'] for e in cme['linkedEvents'] or []]

			an = next((a for a in cme['cmeAnalyses'] or [] if a['isMostAccurate']), None)
			if not an:
				log.debug('DONKI CME without analysis: %s', cme['link'])
				continue
			
			vals = [an[k] for k in ['time21_5', 'latitude', 'longitude', 'halfAngle', 'speed', 'type', 'levelOfData']]
			vals[0] = ('20' + vals[0][2:]) if vals[0].startswith('00') else vals[0] # time21_5 0011-09-22T14:00Z fix
			enlil = next((m for m in (an['enlilList'] or [])[::-1] if m['au'] == 2), None)
			e_shock = enlil and enlil['estimatedShockArrivalTime']
			e_id = enlil and int(enlil['link'].split('/')[-2])
			e_fname = None
			
			data.append([iid, aid, time, *vals, note, linked, e_id, e_shock, e_fname])
	elif what == 'FLR':
		table, cols = FLR_TABLE, FLR_COLS
		for flr in res.json():
			times = (parse_time(flr[t+'Time']) if flr[t+'Time'] else None for t in ['begin', 'peak', 'end'])
			lat, lon = parse_coords(flr['sourceLocation'])
			ctype, note, ar, eid = (flr[k] for k in ['classType', 'note', 'activeRegionNum', 'flrID'])
			iid = int(flr['link'].split('/')[-2])
			linked = [e['activityID'] for e in flr['linkedEvents'] or []]

			data.append([iid, eid, *times, ctype, lat, lon, ar, note, linked])
	else:
		assert not 'reached'
	
	log.info('Upserting [%s] DONKI %ss for %s', len(data), what, s_str)
	psert_many(table, [c.name for c in cols], data, conflict_constraint='id')
	upsert_coverage(table, month_start)

def fetch(progr, entity, month):
	prev_month = (month - timedelta(days=1)).replace(day=1)

	what = { 'flares': 'FLR', 'cmes': 'CME' }[entity]
	progr[1] = 2
	_obtain_month(what, month)
	progr[0] = 1
	_obtain_month(what, prev_month)

def resolve_enlil(eid: int):
	with pool.connection() as conn:
		res = conn.execute(f'SELECT enlil_filename FROM events.{CME_TABLE} WHERE enlil_id = %s', [eid]).fetchone()
	if res and res[0]:
		return res[0]
	log.debug('Resolving WSA-ENLIL #%s', eid)
	url = URL + f'view/WSA-ENLIL/{eid}/-1'
	res = requests.get(url, timeout=10, proxies=proxies)

	if res.status_code != 200:
		log.error('Failed loading %s: HTTP %s', url, res.status_code)
		raise Exception('Failed loading')

	found = re.search(r'Inner Planets Link = (.+?)nasa.gov/downloads/(.+?).tim-', res.text)
	fname = found and found[2]

	if fname: 
		with pool.connection() as conn:
			conn.execute(f'UPDATE events.{CME_TABLE} SET enlil_filename = %s WHERE enlil_id = %s', [fname, eid])
	return fname