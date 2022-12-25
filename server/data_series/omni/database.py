import os, json, logging, requests
import psycopg2, psycopg2.extras
from datetime import datetime, timedelta, timezone
from core.database import pg_conn

log = logging.getLogger('aides')
omniweb_url = 'https://omniweb.gsfc.nasa.gov/cgi/nx1.cgi'
PERIOD = 3600

omni_columns = None

class OmniColumn:
	def __init__(self, name: str, owid: int, stub: str, is_int: bool=False):
		self.name = name
		self.omniweb_id = owid
		self.stub_value = stub
		self.is_int = is_int

def _init():
	global omni_columns
	json_path = os.path.join(os.path.dirname(__file__), './database.json')
	vard_path = os.path.join(os.path.dirname(__file__), './omni_variables.txt')
	with open(json_path) as file, pg_conn.cursor() as cursor:
		columns = json.load(file)
		cols = [f'{c} {columns[c][0]}' for c in columns]
		cursor.execute(f'CREATE TABLE IF NOT EXISTS omni (\n{",".join(cols)})')
		for col in cols:
			cursor.execute(f'ALTER TABLE omni ADD COLUMN IF NOT EXISTS {col}')
	pg_conn.commit()
	omni_columns = []
	with open(vard_path) as file:
		for line in file:
			if not line.strip(): continue
			spl = line.strip().split()
			for column, [typedef, owid] in columns.items():
				if owid is None or spl[0] != str(owid):
					continue
				# Note: omniweb variables descriptions ids start with 1 but internally they start with 0, hence -1
				omni_columns.append(OmniColumn(column, owid - 1, spl[2], 'int' in typedef.lower()))
_init()


def _obtain_omniweb(dt_from: datetime, dt_to: datetime):
	dstart, dend = [d.strftime('%Y%m%d') for d in [dt_from, dt_to]]
	r = requests.post(omniweb_url, stream=True, data = {
		'activity': 'retrieve',
		'res': 'hour',
		'spacecraft': 'omni2',
		'start_date': dstart,
		'end_date': dend,
		'vars': [c.omniweb_id for c in omni_columns]
	})
	if r.status_code != 200:
		log.warn('Omni: query failed - HTTP {r.status_code}')

	data = None
	for line in r.iter_lines(decode_unicode=True):
		if data is not None:
			if not line or '</pre>' in line:
				break
			try:
				split = line.split()
				time = datetime(int(split[0]), 1, 1, tzinfo=timezone.utc) + timedelta(days=int(split[1])-1, hours=int(split[2]))
				row = [time] + [int(v) if c.is_int else float(v) for v, c in zip(split[3:], omni_columns)]
				data.append(row)
			except:
				log.error('Omni: failed to parse line:\n' + line)
		elif 'YEAR DOY HR' in line:
			data = [] # start reading data

	query = f'''INSERT INTO omni (time, {",".join([c.name for c in omni_columns])}) VALUES %s
		ON CONFLICT (time) DO UPDATE SET {",".join([f"{c.name} = EXCLUDED.{c.name}" for c in omni_columns])}'''
	with pg_conn.cursor() as cursor:
		psycopg2.extras.execute_values(cursor, query, data)
	pg_conn.commit()
	log.debug(f'Omni: upserting {len(data)} rows {dstart}:{dend}')
	