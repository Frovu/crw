import requests, json
from datetime import datetime
from database import log
requests.packages.urllib3.disable_warnings() # pylint: disable=no-member

def _obtain_moscow(t_from, t_to, experiment, what, device):
	what = what if what == 'pressure' else 'vertical'
	query = f'https://tools.izmiran.ru/sentinel/api/data?from={t_from}&to={t_to+3600}&dev={device}&fields={what}'
	res = requests.get(query, verify=False, timeout=10000)
	if res.status_code != 200:
		log.warning(f'Muones: failed raw -{res.status_code}- {experiment} {t_from}:{t_to}')
		return []
	json_data = json.loads(res.text)
	data = json_data['rows']
	result = [(datetime.utcfromtimestamp(line[0]), line[1]) for line in data]
	log.debug(f'Muones: got raw [{len(result)}/{(t_to-t_from)//60+1}] {experiment}:{what} {t_from}:{t_to}')
	return result

def _obtain_apatity(t_from, t_to, experiment, what):
	url = 'https://cosmicray.pgia.ru/json/db_query_mysql.php'
	dbn = 'full_muons' if experiment == 'Apatity' else 'full_muons_barentz'
	res = requests.get(f'{url}?db={dbn}&start={t_from}&stop={t_to}&interval=60&acc=valid', timeout=5000)
	if res.status_code != 200:
		log.warning(f'Muones: failed raw -{res.status_code}- {experiment} {t_from}:{t_to}')
		return []
	target = 'pressure_mu' if what == 'pressure' else 'mu_dn'
	data = json.loads(res.text)
	if not data:
		log.warning(f'Muones: no data {experiment} {t_from}:{t_to}')
		return []

	result = [(datetime.utcfromtimestamp(int(line['timestamp'])), line[target]) for line in data]
	log.debug(f'Muones: got raw [{len(result)}/{(t_to-t_from)//60+1}] {experiment} {t_from}:{t_to}')
	return result

def obtain(t_from, t_to, experiment, what):
	if experiment in ['Moscow-pioneer', 'Moscow-cell']:
		return _obtain_moscow(t_from, t_to, experiment, what, 'muon-pioneer')
	if experiment in ['Apatity', 'Barentsburg']:
		return _obtain_apatity(t_from, t_to, experiment, what)
	
	raise ValueError('Expermient not supported: '+str(experiment))
