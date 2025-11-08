from datetime import datetime, timezone

import requests
from psycopg.sql import SQL

from database import pool, log, upsert_many, get_coverage, upsert_coverage
from events.columns.column import Column as Col
from events.source.donki import parse_coords

TABLE = 'cactus_cmes'
LZ_URL = 'https://www.sidc.be/cactus/catalog/LASCO/2_5_0/cme_lz.txt'
QKL_URL = 'https://www.sidc.be/cactus/catalog/LASCO/2_5_0/cme_qkl.txt'

COLS = [ # ORDERED !!!
	Col(TABLE, 'time', not_null=True, dtype='time', description='Onset time, earliest indication of liftoff'),
	Col(TABLE, 'cactus_id', not_null=True, dtype='integer', description='CACTus CME id within month'),
	Col(TABLE, 'dt0', name='t lift', description='Duration of liftoff (hours)'),
	Col(TABLE, 'central_angle', name='angle', description='Principal angle, counterclockwise from North (degrees)'),
	Col(TABLE, 'angular_width', name='width', description='Angular Wwidth, deg'),
	Col(TABLE, 'speed', description='Median velocity, km/s'),
	Col(TABLE, 'dv', description='Variation (1 sigma) of velocity over the width of the CME'),
	Col(TABLE, 'minv', description='Lowest velocity detected within the CME'),
	Col(TABLE, 'maxv', description='Highest velocity detected within the CME'),
]

def _init():
	cols = SQL(',\n').join([c.sql_col_def() for c in COLS if c])
	query = SQL(f'CREATE TABLE IF NOT EXISTS events.{TABLE} (\n{{}}, '+
		'UNIQUE NULLS NOT DISTINCT(time, cactus_id))').format(cols)
	
	with pool.connection() as conn:
		conn.execute(query)
_init()

def scrape_cactus(which: str, cutoff: datetime|None=None):
	log.debug(f'Loading CACTUS {which} CMEs')
	res = requests.get(LZ_URL if which == 'lz' else QKL_URL, timeout=10)

	if res.status_code != 200:
		log.error('CACTUS CME failed: HTTP %s', res.status_code)
		raise Exception('Failed to load')

	data = []
	last = 0
	for line in res.text.splitlines():
		if not line or line[0] != ' ':
			continue
		
		split = line.split('|')
		cact_id = int(split[0].strip())
		time = datetime.strptime(split[1], '%Y/%m/%d %H:%M').replace(tzinfo=timezone.utc)


		if cutoff and time <= cutoff:
			continue

		values = (time, cact_id,*(float(s.strip()) for s in split[2:-1]))

		data.append(values)

	return data


def fetch(progr):
	progr[1] = 6

	lz_data = scrape_cactus('lz')
	progr[0] = 1

	qkl_since = lz_data[-1][0]
	qkl_data = scrape_cactus('qkl', qkl_since)
	progr[0] = 2

	log.debug(f'Replacing CACTUS CMEs table')
	with pool.connection() as conn:
		conn.execute(f'DELETE FROM events.{TABLE}')
	progr[0] = 3

	psert_many(TABLE, [c.name for c in COLS], lz_data, conflict_constraint='time, cactus_id')
	progr[0] = 4
	psert_many(TABLE, [c.name for c in COLS], qkl_data, conflict_constraint='time, cactus_id')
	progr[0] = 5
	upsert_coverage(TABLE, lz_data[0][0], qkl_data[-1][0], single=True)
