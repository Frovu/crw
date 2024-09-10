from datetime import datetime, timedelta, timezone
import os, json, re
import numpy as np
from math import floor, ceil
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
import requests, pymysql

from database import log, pool, upsert_many
from data.omni.derived import compute_derived
from data.omni.sw_types import obtain_yermolaev_types, derive_from_sw_type, SW_TYPE_DERIVED_SERIES

omniweb_url = 'https://omniweb.gsfc.nasa.gov/cgi/nx1.cgi'
PERIOD = 3600
SPACECRAFT_ID = {
	'ace': 71,
	'dscovr': 81
}

omni_mutex = Lock()
omni_columns = None
all_column_names = None
dump_info = None
dump_info_path = os.path.join(os.path.dirname(__file__), '../../../tmp/omni_dump_info.json')

class OmniColumn:
	def __init__(self, name: str, crs_name: str, owid: int, stub: str, is_int: bool=False):
		self.name = name
		self.crs_name = crs_name
		self.omniweb_id = owid
		self.stub_value = stub
		self.is_int = is_int

def _init():
	global omni_columns, all_column_names, dump_info
	json_path = os.path.join(os.path.dirname(__file__), './database.json')
	vard_path = os.path.join(os.path.dirname(__file__), './omni_variables.txt')
	with open(json_path, encoding='utf-8') as file, pool.connection() as conn:
		columns = json.load(file)
		cols = [f'{c} {columns[c][0]}' for c in columns]
		conn.execute(f'CREATE TABLE IF NOT EXISTS omni (\n{",".join(cols)})')
		for col in cols:
			conn.execute(f'ALTER TABLE omni ADD COLUMN IF NOT EXISTS {col}')
	omni_columns = []
	with open(vard_path, encoding='utf-8') as file:
		for line in file:
			if not line.strip(): continue
			spl = line.strip().split()
			for column, desc in columns.items():
				typedef, owid = desc[:2]
				crs_name = desc[2] if len(desc) > 2 else None
				if owid is None or spl[0] != str(owid):
					continue
				# Note: omniweb variables descriptions ids start with 1 but internally they start with 0, hence -1
				omni_columns.append(OmniColumn(column, crs_name, owid - 1, spl[2], 'int' in typedef.lower()))
	all_column_names = [c.name for c in omni_columns] \
		+ [col for col, desc in columns.items() if desc[1] is None and col != 'time']
	try:
		with open(dump_info_path, encoding='utf-8') as file:
			dump_info = json.load(file)
	except:
		dump_info = {}
		log.warning('Omniweb: Failed to read %s', str(dump_info_path))
_init()

def _obtain_omniweb(columns, interval):
	dstart, dend = [d.strftime('%Y%m%d') for d in interval]
	log.debug(f'Omniweb: querying {dstart}-{dend}')
	r = requests.post(omniweb_url, stream=True, data = {
		'activity': 'retrieve',
		'res': 'hour',
		'spacecraft': 'omni2',
		'start_date': dstart,
		'end_date': dend,
		'vars': [c.omniweb_id for c in columns]
	}, timeout=5000)
	if r.status_code != 200:
		log.warning('Omniweb: query failed - HTTP %s', r.status_code)

	data = None
	for line in r.iter_lines(decode_unicode=True):
		if data is not None:
			if not line or '</pre>' in line:
				break
			try:
				split = line.split()
				time = datetime(int(split[0]), 1, 1, tzinfo=timezone.utc) + timedelta(days=int(split[1])-1, hours=int(split[2]))
				row = [time] + [(int(v) if c.is_int else float(v)) if v != c.stub_value else None for v, c in zip(split[3:], columns)]
				data.append(row)
			except:
				log.error('Omniweb: failed to parse line:\n %s', line)
		elif 'YEAR DOY HR' in line:
			data = [] # start reading data
		elif 'INVALID' in line:
			correct_range = re.findall(r' (\d+)', line)
			new_range = [datetime.strptime(s, '%Y%m%d') for s in correct_range]
			if interval[1] < new_range[0] or new_range[1] < interval[0]:
				log.info('Omniweb: out of bounds')
				return None
			log.info(f'Omniweb: correcting range to fit {correct_range[0]}:{correct_range[1]}')
			return _obtain_omniweb(columns, (max(new_range[0], interval[0]), min(new_range[1], interval[1])))
	return data

def _obtain_izmiran(source, columns, interval):
	try:
		conn = pymysql.connect(
			host=os.environ.get('CRS_HOST'),
			port=int(os.environ.get('CRS_PORT', 0)),
			user=os.environ.get('CRS_USER'),
			password=os.environ.get('CRS_PASS'),
			database=source)
		with conn.cursor() as cursor:
			if source == 'geomag':
				geomag_q = '\nUNION '.join([f'SELECT dt + interval {h} hour as dt, kp{1 + h//3} as kp, ap{1 + h//3} as ap FROM geomag' for h in range(24)])
				query = 'SELECT dst.dt, ' + ', '.join([c.crs_name for c in columns]) +\
					f' FROM dst JOIN (SELECT * FROM ({geomag_q}) gq WHERE dt > %s - interval 1 day AND dt < %s + interval 1 day) gm ' +\
					'ON dst.dt = gm.dt WHERE dst.dt >= %s AND dst.dt <= %s'
				interval += interval
			else:
				# TODO: insert sw_cnt, imf_cnt
				query = 'SELECT min(dt) as time,' + ', '.join([f'round(avg(if({c.crs_name} > -999, {c.crs_name}, NULL)), 2)' for c in columns]) +\
					f' FROM {source} WHERE dt >= %s AND dt < %s + interval 1 hour GROUP BY date(dt), extract(hour from dt)'''
			cursor.execute(query, interval)
			data = list(cursor.fetchall())
			if source == 'geomag':
				kp_col = [c.name for c in columns].index('kp_index')
				kp_inc = { 'M': -3, 'Z': 0, 'P': 3 }
				parse_kp = lambda s: None if s == '-1' else int(s[:-1]) * 10 + kp_inc[s[-1]]
				for i in range(len(data)):
					row = data[i] = list(data[i])
					row[1 + kp_col] = parse_kp(row[1 + kp_col])
		return data
	except BaseException as e:
		log.error(f'Omni: failed to query izmiran/{source}: {e}')
	finally:
		conn.close()

def _obtain_yermolaev(interv):
	batches = [obtain_yermolaev_types(y) for y in range(interv[0].year, interv[1].year + 1)]
	return [d for dt in batches for d in dt or []]

def _cols(group, source='omniweb', do_remove=False):
	if 'yermolaev' in [source, group]:
		return []
	if 'geomag' in [source, group]:
		return [c for c in omni_columns if c.name in ['kp_index', 'ap_index', 'dst_index']]

	if group not in ['all', 'sw', 'imf']:
		raise ValueError('Bad param group')
	if source not in ['omniweb', 'ace', 'dscovr']:
		raise ValueError('Unknown source')
	sw_cols = [c for c in omni_columns if c.name in ['sw_speed', 'sw_density', 'sw_temperature']]
	imf_cols = [c for c in omni_columns if c.name in ['imf_scalar', 'imf_x', 'imf_y', 'imf_z']]

	return {
		'all': omni_columns if source == 'omniweb' or do_remove else sw_cols + imf_cols,
		'sw':  ([c for c in omni_columns if c.name == 'spacecraft_id_sw']
			if source == 'omniweb' or do_remove else []) + sw_cols,
		'imf': ([c for c in omni_columns if c.name == 'spacecraft_id_imf']
			if source == 'omniweb' or do_remove else []) + imf_cols
	}[group]

def obtain(source: str, interval: [int, int], group: str='all', overwrite=False):
	interval = [
		floor(interval[0] / PERIOD) * PERIOD,
		 ceil(interval[1] / PERIOD) * PERIOD ]
	dt_interval = [datetime.utcfromtimestamp(t) for t in interval]
	if source in 'geomag':
		group = 'geomag'
	if source in 'yermolaev':
		group = 'sw_type'

	log.debug(f'Omni: querying *{group} from {source} {dt_interval[0]} to {dt_interval[1]}')

	query = _cols(group, source) if group != 'sw_type' else []
	col_names = [c.name for c in query] if group != 'sw_type' else ['sw_type']
	if source == 'omniweb':
		res = _obtain_omniweb(query, dt_interval)
	elif source == 'yermolaev':
		res = _obtain_yermolaev(dt_interval)
	else:
		res = _obtain_izmiran(source, query, dt_interval)

	if not res:
		log.warning('Omni: got no data')
		return 0


	data, fields = compute_derived(res, col_names)

	log.info(f'Omni: {"hard " if overwrite else ""}upserting *{group} from {source}: [{len(data)}] rows from {dt_interval[0]} to {dt_interval[1]}')
	with pool.connection() as conn:
		if source in ['ace', 'dscovr']:
			cid = SPACECRAFT_ID[source]
			if group != 'imf':
				conn.execute('UPDATE omni SET spacecraft_id_sw = %s WHERE %s <= time AND time <= %s' +
					(' AND imf_scalar IS NULL' if not overwrite else ''), [cid, *dt_interval])
			if group != 'sw':
				conn.execute('UPDATE omni SET spacecraft_id_imf = %s WHERE %s <= time AND time <= %s' +
					(' AND sw_speed IS NULL' if not overwrite else ''), [cid, *dt_interval])
	upsert_many('omni', ['time', *fields], data, write_nulls=overwrite, write_values=overwrite)

	return len(data)

def remove(interval: [int, int], group):
	cols = [c.name for c in _cols(group, do_remove=True)]
	with pool.connection() as conn:
		curs = conn.execute('UPDATE omni SET ' + ', '.join([f'{c} = NULL' for c in cols]) +
			' WHERE to_timestamp(%s) <= time AND time <= to_timestamp(%s)', interval)
		return curs.rowcount
		
def insert(var, data):
	if not var in all_column_names:
		raise ValueError('Unknown var: '+var)
	for row in data:
		row[0] = datetime.utcfromtimestamp(row[0])
	log.info(f'Omni: upserting from ui: [{len(data)}] rows from {data[0][0]} to {data[-1][0]}')
	upsert_many('omni', ['time', var], data)

def select(interval: [int, int], query=None, epoch=True):
	all_series = all_column_names + SW_TYPE_DERIVED_SERIES
	columns = [c for c in query if c in all_column_names] if query else all_column_names
	any_sw_type_dervied = query and next((q for q in query if q in SW_TYPE_DERIVED_SERIES), None)
	if any_sw_type_dervied and 'sw_type' not in columns:
		columns.append('sw_type')
	with pool.connection() as conn:
		curs = conn.execute(f'SELECT {"EXTRACT(EPOCH FROM time)::integer as" if epoch else ""} time, {",".join(columns)} ' +
			'FROM omni WHERE to_timestamp(%s) <= time AND time <= to_timestamp(%s) ORDER BY time', interval)
		data, fields = np.array(curs.fetchall(), dtype='object'), [desc[0] for desc in curs.description]
	return derive_from_sw_type(data, fields, [c for c in query if c in all_series]) if any_sw_type_dervied else (data, fields)

def ensure_prepared(interval: [int, int], trust=False):
	global dump_info
	with omni_mutex:
		if not trust:
			if dump_info and dump_info.get('from') <= interval[0] and dump_info.get('to') >= interval[1]:
				return dump_info
			cov_from, cov_to = dump_info.get('from'), dump_info.get('to', interval[1])
			res_from = min(cov_from, interval[0]) if cov_from else interval[0]
			ffrom, fto = cov_to if cov_from and cov_from <= interval[0] else interval[0], interval[1]
			log.info(f'Omni: beginning bulk fetch {ffrom}:{fto}')
			batch_size = 3600 * 24 * 1000
			with ThreadPoolExecutor(max_workers=4) as executor:
				for start in range(ffrom, fto+1, batch_size):
					end = start + batch_size
					interv = [start, end if end < fto else fto]
					executor.submit(obtain, 'omniweb', interv)
			log.info('Omni: bulk fetch finished')
		else:
			res_from, fto = interval
			log.info(f'Omni: force setting coverarge to {res_from}:{fto}')

		with open(dump_info_path, 'w', encoding='utf-8') as file:
			dump_info = { 'from': int(res_from), 'to': int(fto), 'at': int(datetime.now().timestamp()) }
			json.dump(dump_info, file)
	return dump_info