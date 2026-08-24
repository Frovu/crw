from datetime import datetime, timedelta, timezone, time
import os, re, traceback
from math import floor, ceil
from threading import Lock
import requests, pymysql

from database import log, upsert_many
from data.omni.derived import compute_derived
from data.omni.sw_types import obtain_yermolaev_types

from data.omni.variables import OmniVariable, GROUP, SOURCE, get_vars
from data.omni.spacecraft import spacecraft_id, noaa_hapi_spacecraft_id

proxy = os.environ.get('NASA_PROXY')
omniweb_proxies = { "http": proxy, "https": proxy } if proxy else { }
omniweb_url = 'https://omniweb.gsfc.nasa.gov/cgi/nx1.cgi'
noaa_hapi_url = 'https://tlv-swpc.woc.noaa.gov/hapi/data'
PERIOD = 3600

omni_fetch_lock = Lock()

def _obtain_omniweb(vars: list[OmniVariable], interval: tuple[datetime, datetime]):
	dstart, dend = [d.strftime('%Y%m%d') for d in interval]
	log.debug(f'Omniweb: querying {dstart}-{dend}')
	r = requests.post(omniweb_url, stream=True, data = {
		'activity': 'retrieve',
		'res': 'hour',
		'spacecraft': 'omni2',
		'start_date': dstart,
		'end_date': dend,
		'vars': [(var.omniweb_id or 0) - 1 for var in vars] # NOTE: ids in def file start with 1, but here they start with 0
	}, timeout=5, proxies=omniweb_proxies)
	if r.status_code != 200:
		log.warning('Omniweb: query failed - HTTP %s', r.status_code)
		
	data = None
	line: str
	for line in r.iter_lines(decode_unicode=True): # type: ignore
		if data is not None:
			if not line or '</pre>' in line:
				break
			try:
				split = line.split()
				time = datetime(int(split[0]), 1, 1, tzinfo=timezone.utc) + timedelta(days=int(split[1])-1, hours=int(split[2]))
				row = [time] + [(int(v) if c.is_int else float(v)) if v != c.omniweb_stub else None for v, c in zip(split[3:], vars)]
				data.append(row)
			except:
				traceback.print_exc()
				log.error('Omniweb: failed to parse line:\n %s', line)
		elif 'YEAR DOY HR' in line:
			data = [] # start reading data
		elif 'INVALID' in line:
			correct_range = re.findall(r' (\d+)', line)
			new_range = [datetime.strptime(s, '%Y%m%d').replace(tzinfo=timezone.utc) for s in correct_range]
			if interval[1] < new_range[0] or new_range[1] < interval[0]:
				log.info('Omniweb: out of bounds')
				return None
			log.info(f'Omniweb: correcting range to fit {correct_range[0]}:{correct_range[1]}')
			return _obtain_omniweb(vars, (max(new_range[0], interval[0]), min(new_range[1], interval[1])))
	return data

def _obtain_crs(source: SOURCE, vars: list[OmniVariable], interval: tuple[datetime, datetime]):
	conn = None
	source_table = str(source.value)
	if source_table == 'f107': source_table = 'solar'
	try:
		log.debug(f'Omni: querying {",".join([v.crs_name or '' for v in vars])} from crs {interval[0]} to {interval[1]}')
		conn = pymysql.connect(
			host=os.environ.get('CRS_HOST'),
			port=int(os.environ.get('CRS_PORT', 0)),
			user=os.environ.get('CRS_USER'),
			password=os.environ.get('CRS_PASS', ''),
			database=source_table)
		with conn.cursor() as cursor:
			if source == SOURCE.geomag:
				geomag_q = '\nUNION '.join([f'SELECT dt + interval {h} hour as dt, kp{1 + h//3} as kp, ap{1 + h//3} as ap FROM geomag' for h in range(24)])
				query = 'SELECT dst.dt, ' + ', '.join([c.crs_name or '' for c in vars]) +\
					f' FROM dst JOIN (SELECT * FROM ({geomag_q}) gq WHERE dt > %s - interval 1 day AND dt < %s + interval 1 day) gm ' +\
					'ON dst.dt = gm.dt WHERE dst.dt >= %s AND dst.dt <= %s'
				cursor.execute(query, interval + interval)
			elif source == SOURCE.F107:
				query = 'SELECT dt, f107 FROM radio_f107 WHERE dt >= %s AND dt < %s'''
				cursor.execute(query, interval)
			else:
				query = 'SELECT DATE_FORMAT(min(dt), \'%%Y-%%m-%%d %%H:00:00\'),' + ', '.join([f'round(avg(if({c.crs_name} > -999, {c.crs_name}, NULL)), 2)' for c in vars]) +\
					f' FROM {source_table} WHERE dt >= %s AND dt < %s + interval 1 hour GROUP BY date(dt), extract(hour from dt)'''
				cursor.execute(query, interval)

			data = list(list(row) for row in cursor.fetchall())

			if source == SOURCE.geomag:
				kp_col = [c.name for c in vars].index('Kp')
				kp_inc = { 'M': -3, 'Z': 0, 'P': 3 }
				parse_kp = lambda s: None if s == '-1' else int(s[:-1]) * 10 + kp_inc[s[-1]]
				for i in range(len(data)):
					data[i][1 + kp_col] = parse_kp(data[i][1 + kp_col])
			elif source == SOURCE.F107:
				data = [[datetime.combine(dt, time(hr)), val] for dt, val in data for hr in range(24)]

		return data
	except Exception as e:
		traceback.print_exc()
		log.error(f'Omni: failed to query izmiran/{source_table}: {e}')
		raise e
	finally:
		if conn: conn.close()

def _obtain_noaa_hapi(vars: list[OmniVariable], interval: tuple[datetime, datetime]):
	dstart, dend = [d.isoformat()[:19] + 'Z' for d in interval]
	log.debug(f'NOAA/hapi: querying {vars[0].group} {dstart} to {dend}')
	r = requests.get(noaa_hapi_url, stream=True, params = {
		'id': 'active-mag-pt1h' if vars[0].group == GROUP.IMF else 'active-plasma-pt1h',
		'parameters': ','.join([var.noaa_name for var in vars]), # type: ignore
		'time.min': dstart,
		'time.max': dend
	}, timeout=5, proxies=omniweb_proxies)

	if r.status_code != 200:
		log.error('NOAA/hapi: query failed - HTTP %s', r.status_code)
		return vars, None

	data = []
	ordered_vars: list[OmniVariable] = []
	sc_id_idx = None

	line: str
	for line in r.iter_lines(decode_unicode=True): # type: ignore
		if not line: continue
		split = line.split(',')
		if not ordered_vars or sc_id_idx is None:
			ordered_vars = [next((v for v in vars if v.noaa_name == name)) for name in split[1:]]
			sc_id_idx = next((i for i, v in enumerate(ordered_vars) if v.name.startswith('sc_id')))
			continue

		date = datetime.strptime(split[0], '%Y-%m-%dT%H:%M:%SZ')
		row = [date] + [None if s == 'null' else float(s) for s in split[1:]]
		sc_name = noaa_hapi_spacecraft_id.get(int(split[sc_id_idx+1]))
		row[sc_id_idx+1] = spacecraft_id[sc_name] if sc_name else 99
		data.append(row)

	return ordered_vars, data
	
def _obtain_yermolaev(interv):
	batches = [obtain_yermolaev_types(y) for y in range(interv[0].year, interv[1].year + 1)]
	return [d for dt in batches for d in dt or []]

def obtain(interval: tuple[int, int], groups: list[GROUP], source: SOURCE, overwrite=False):
	interval = (
		floor(interval[0] / PERIOD) * PERIOD,
		 ceil(interval[1] / PERIOD) * PERIOD )
	dt = lambda t: datetime.fromtimestamp(t, tz=timezone.utc)
	dt_interval = (dt(interval[0]), dt(interval[1]))

	if source == SOURCE.NOAA:
		if len(groups) > 1:
			return max([obtain(interval, [gr], source, overwrite) for gr in groups if gr in [GROUP.IMF, GROUP.SW]])

	vars = get_vars(groups, source, include_derived=False)

	if source == SOURCE.omniweb:
		vars = [v for v in vars if v.omniweb_name or v.omniweb_id]
		res = _obtain_omniweb(vars, dt_interval)
	elif source == SOURCE.SWTY:
		res = _obtain_yermolaev(dt_interval)
	elif source == SOURCE.NOAA:
		vars = [v for v in vars if v.noaa_name]
		vars, res = _obtain_noaa_hapi(vars, dt_interval)
	elif source in [SOURCE.ACE, SOURCE.geomag, SOURCE.F107]:
		vars = [v for v in vars if v.crs_name and not v.name.startswith('sc_id')]
		res = _obtain_crs(source, vars, dt_interval)
	else:
		assert not 'reached'

	if not res:
		log.warning('Omni: got no data')
		return 0

	col_names = [var.name for var in vars]
	data, col_names = compute_derived(res, col_names)
	constants = {}

	if source in [SOURCE.ACE]:
		sc_id = spacecraft_id[str(source.value).upper()]
		for group in [GROUP.IMF, GROUP.SW]:
			if not group in groups: continue
			sc_id_col = 'sc_id_' + str(group.value).lower()
			constants[sc_id_col] = sc_id
			
	grps = ','.join([str(g.value).upper() for g in groups if next((v for v in vars if v.group == g), None)])
	log.info(f'Omni: {"hard " if overwrite else ""}upserting {grps} from {str(source).upper()}: [{len(data)}] from {data[0][0]} to {data[-1][0]}')

	upsert_many('omni', ['time', *col_names], data, constants=constants, write_nulls=overwrite, write_values=overwrite, schema='public')

	return len(data)
