import os, logging, requests

log = logging.getLogger('aides')
CRDT_HOST = os.environ.get('CRDT_HOST', 'http://localhost:5000')
session = requests.Session()

def select(interval: [int, int], query=None):
	res = session.get(CRDT_HOST + f'/api/omni?from={interval[0]}&to={interval[1]}&query={",".join(query)}', verify=False)

	if res.status_code != 200:
		log.warn(f'Failed to obtain omni data - HTTP {res.status_code}')
		raise Exception('Failed to fetch omni')
	
	json = res.json()
	return json["rows"], json["fields"]

def ensure_prepared(interval: [int, int]):
	res = session.get(CRDT_HOST + f'/api/omni/ensure?from={interval[0]}&to={interval[1]}', verify=False)
	if res.status_code != 200:
		log.warn(f'Failed to ensure omni - HTTP {res.status_code}')
		raise Exception('Failed to ensure omni')
