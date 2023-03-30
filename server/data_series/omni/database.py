import os, json, logging, requests, re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from core.database import pool
from data_series.util import integrity_query
from data_series.omni.derived import compute_derived

log = logging.getLogger('aides')
omniweb_url = 'https://omniweb.gsfc.nasa.gov/cgi/nx1.cgi'
PERIOD = 3600

omni_columns = None
column_names = None
dump_info = None
dump_info_path = os.path.join(os.path.dirname(__file__), '../../data/omni_dump_info.json')

obtains_cache = dict()

class OmniColumn:
	def __init__(self, name: str, owid: int, stub: str, is_int: bool=False):
		self.name = name
		self.omniweb_id = owid
		self.stub_value = stub
		self.is_int = is_int

def _init():
	global omni_columns, column_names, dump_info
	json_path = os.path.join(os.path.dirname(__file__), './database.json')
	vard_path = os.path.join(os.path.dirname(__file__), './omni_variables.txt')
	with open(json_path) as file, pool.connection() as conn:
		columns = json.load(file)
		cols = [f'{c} {columns[c][0]}' for c in columns]
		conn.execute(f'CREATE TABLE IF NOT EXISTS omni (\n{",".join(cols)})')
		for col in cols:
			conn.execute(f'ALTER TABLE omni ADD COLUMN IF NOT EXISTS {col}')
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
	column_names = [c.name for c in omni_columns] + [col for col, [td, owid] in columns.items() if owid is None and col != 'time']
	try:
		with open(dump_info_path) as file:
			dump_info = json.load(file)
	except:
		log.warn('Omniweb: Failed to read ' + str(dump_info_path))

_init()


def _obtain_omniweb(dt_from: datetime, dt_to: datetime):
	dstart, dend = [d.strftime('%Y%m%d') for d in [dt_from, dt_to]]
	log.debug(f'Omniweb: querying {dstart}-{dend}')
	r = requests.post(omniweb_url, stream=True, data = {
		'activity': 'retrieve',
		'res': 'hour',
		'spacecraft': 'omni2',
		'start_date': dstart,
		'end_date': dend,
		'vars': [c.omniweb_id for c in omni_columns]
	})
	if r.status_code != 200:
		log.warn('Omniweb: query failed - HTTP {r.status_code}')

	data = None
	for line in r.iter_lines(decode_unicode=True):
		if data is not None:
			if not line or '</pre>' in line:
				break
			try:
				split = line.split()
				time = datetime(int(split[0]), 1, 1, tzinfo=timezone.utc) + timedelta(days=int(split[1])-1, hours=int(split[2]))
				row = [time] + [(int(v) if c.is_int else float(v)) if v != c.stub_value else None for v, c in zip(split[3:], omni_columns)]
				data.append(row)
			except:
				log.error('Omniweb: failed to parse line:\n' + line)
		elif 'YEAR DOY HR' in line:
			data = [] # start reading data
		elif 'INVALID' in line:
			correct_range = re.findall(r' (\d+)', line)
			new_range = [datetime.strptime(s, '%Y%m%d') for s in correct_range]
			if dt_to < new_range[0] or new_range[1] < dt_from:
				log.info(f'Omniweb: out of bounds')
				return 
			log.info(f'Omniweb: correcting range to fit {correct_range[0]}:{correct_range[1]}')
			return _obtain_omniweb(max(new_range[0], dt_from), min(new_range[1], dt_to))

	data = compute_derived(data, [c.name for c in omni_columns])
	query = f'''INSERT INTO omni (time, {",".join(column_names)}) VALUES %s
		ON CONFLICT (time) DO UPDATE SET {",".join([f"{c} = EXCLUDED.{c}" for c in column_names])}'''
	with pool.connection() as conn:
		psycopg2.extras.execute_values(cursor, query, data)
	log.debug(f'Omniweb: upserting {len(data)} rows {dstart}-{dend}')

def _obtain(gap):
	if not (future := obtains_cache.get(gap)):
		with ThreadPoolExecutor() as executor:
			obtains_cache[gap] = future = executor.submit(_obtain_omniweb, *gap)
	future.result()
	obtains_cache.pop(gap, None)

def select(interval: [int, int], query=None, epoch=True):
	columns = [c for c in column_names if c in query] if query else column_names
	with pool.connection() as conn:
		curs = conn.execute(f'SELECT {"EXTRACT(EPOCH FROM time)::integer as" if epoch else ""} time, {",".join(columns)} ' +
			'FROM omni WHERE to_timestamp(%s) <= time AND time <= to_timestamp(%s) ORDER BY time', interval)
		return curs.fetchall(), [desc[0] for desc in curs.description]

def fetch(interval: [int, int], query=None, refetch=False):
	columns = [c for c in column_names if c in query] if query else column_names
	if len(columns) < 1:
		raise ValueError('Zero fields match query')
	with pool.connection() as conn:
		gaps = conn.execute(integrity_query(interval, PERIOD, 'omni', columns if refetch else ['time'], return_epoch=False)).fetchall()
		for gap in gaps:
			try:
				_obtain(gap)
			except Exception as e:
				log.error(f'Omni: failed to obtain {gap[0]} to {gap[1]}: {str(e)}')
	return select(interval, query)

def ensure_prepared(interval: [int, int]):
	global dump_info
	if dump_info and dump_info.get('from') <= interval[0] and dump_info.get('to') >= interval[1]:
		return
	log.info(f'Omniweb: beginning bulk fetch {interval[0]}:{interval[1]}')
	batch_size = 3600 * 24 * 1000
	for start in range(interval[0], interval[1], batch_size):
		end = start + batch_size
		interv = [start, end if end < interval[1] else interval[1]]
		_obtain_omniweb(*[datetime.utcfromtimestamp(i) for i in interv])
	log.info(f'Omniweb: bulk fetch finished')
	with open(dump_info_path, 'w') as file:
		dump_info = { 'from': int(interval[0]), 'to': int(interval[1]), 'at': int(datetime.now().timestamp()) }
		json.dump(dump_info, file)