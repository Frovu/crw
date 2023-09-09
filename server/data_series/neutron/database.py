from core.database import pool
from threading import Lock
import os, logging, time, requests
import numpy as np
requests.packages.urllib3.disable_warnings() 

log = logging.getLogger('aides')

CRDT_HOST = os.environ.get('CRDT_HOST', 'http://localhost:5000')
session = requests.Session()
MAX_CACHE_ENTRIES = 4
CACHE_LIFE_TIME = 30 # sec
fetch_mutex = Lock()
cache = dict()
cache_time = dict()

def _init():
	with open(os.path.join(os.path.dirname(__file__), './database_init.sql')) as file:
		init_text =  file.read()
	with pool.connection() as conn:
		conn.execute(init_text)
_init()

def fetch(interval, stations):
	with fetch_mutex:
		cached_at = cache_time.get(interval)
		if cached_at and time.time() - cached_at < CACHE_LIFE_TIME:
			cache_time[interval] = time.time()
			return cache[interval]

		log.info(f'RSM: querying neutrons {interval[0]}:{interval[1]}')
		res = session.get(CRDT_HOST + f'/api/neutron?from={interval[0]}&to={interval[1]}&stations={",".join(stations)}', verify=False)

		if res.status_code != 200:
			log.warn(f'Failed to obtain neutron data - HTTP {res.status_code}')
			raise Exception('Failed to fetch neutrons')
		
		json = res.json()

		data = [json['fields'][1:], np.array(json['rows'], 'f8')]
		if not len(data):
			raise Exception('No neutron data')

		if len(cache.keys()) >= MAX_CACHE_ENTRIES:
			val, interv = min((val, interv) for (interv, val) in cache_time.items())
			del cache[interv]
			del cache_time[interv]

		cache[interval] = data
		cache_time[interval] = time.time()
		return data


def select_rsm_stations(interval_end, exclude=[]):
	with pool.connection() as conn:
		rows = conn.execute('SELECT id, drift_longitude FROM neutron_stations ' + \
			'WHERE closed_at IS NULL OR closed_at > to_timestamp(%s) ORDER BY drift_longitude', [interval_end]).fetchall()
		return [(sid, lon) for sid, lon in rows if sid not in exclude]