from threading import Lock
import os, logging, time, requests
import numpy as np
from core.database import pool
requests.packages.urllib3.disable_warnings() # pylint: disable=no-member

log = logging.getLogger('aides')

CRDT_HOST = os.environ.get('CRDT_HOST', 'http://localhost:5000')
session = requests.Session()
MAX_CACHE_ENTRIES = 4
CACHE_LIFE_TIME = 30 # sec
fetch_mutex = Lock()
cache = dict()
cache_time = dict()

def _init():
	with open(os.path.join(os.path.dirname(__file__), './database_init.sql'), encoding='utf-8') as file:
		init_text =  file.read()
	with pool.connection() as conn:
		conn.execute(init_text)
_init()

def fetch(interval, stations):
	with fetch_mutex:
		cache_key = (interval, stations)
		cached_at = cache_time.get(cache_key)
		if cached_at and time.time() - cached_at < CACHE_LIFE_TIME:
			cache_time[cache_key] = time.time()
			return cache[cache_key]

		log.info(f'RSM: querying neutrons {interval[0]}:{interval[1]}')
		res = session.get(CRDT_HOST + f'/api/neutron?from={interval[0]}&to={interval[1]}&stations={",".join(stations)}', verify=False)

		if res.status_code != 200:
			log.warning(f'Failed to obtain neutron data - HTTP {res.status_code}')
			raise Exception('Failed to fetch neutrons')
		
		json = res.json()

		data = [json['fields'][1:], np.array(json['rows'], 'f8')]
		if len(data) < 1:
			raise Exception('No neutron data')

		if len(cache.keys()) >= MAX_CACHE_ENTRIES:
			val, key = min((val, key) for (key, val) in cache_time.items())
			del cache[key]
			del cache_time[key]

		cache[cache_key] = data
		cache_time[cache_key] = time.time()
		return data


def select_rsm_stations(interval_end, exclude=[]):
	with pool.connection() as conn:
		rows = conn.execute('SELECT id, drift_longitude FROM neutron_stations ' + \
			'WHERE closed_at IS NULL OR closed_at > to_timestamp(%s) ORDER BY drift_longitude', [interval_end]).fetchall()
		return [(sid, lon) for sid, lon in rows if sid not in exclude]