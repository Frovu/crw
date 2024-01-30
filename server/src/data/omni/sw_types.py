import requests
from database import log
from datetime import datetime, timedelta, timezone

SW_TYPES = ['HCS', 'HCS?', None, None, None, None, 'CIR', 'CIR?', 'EJE', 'EJE?',
	'MC', 'MC?', 'SH', 'SH?', 'IS', 'IS?', 'ISa', 'ISa?', 'RARE', 'RARE?']

SW_TYPE_DERIVED_SERIES = [
	'sw_type_present',
	'sw_is_hcs',
	'sw_is_cir',
	'sw_is_ejecta',
	'sw_is_mc',
	'sw_is_sheath',
	'sw_is_shock',
	'sw_is_shock_reverse',
	'sw_is_rare'
]

def derive_from_sw_type(data, series):
	pass


def obtain_yermolaev_types(year: int):
	if year < 1976:
		return None
	log.debug('Obtaining yermolaev sw types from iki.rssi.ru [%s]', year)
	uri = f'http://iki.rssi.ru/omni/catalog/{year}/{year}swgr.txt'
	res = requests.get(uri, stream=True, timeout=5000)
	if res.status_code != 200:
		log.error('Failed to get iki.rssi.ru - HTTP %s', res.status_code)
		return None

	data = []
	for line in res.iter_lines(decode_unicode=True):
		if not line:
			continue
		split = line.split()
		assert len(split) == 23
		# year DOY hour
		date = datetime(int(split[0]), 1, 1, int(split[2]), tzinfo=timezone.utc) \
			 + timedelta(int(split[1]) - 1)
		types = []
		for i in range(20):
			if split[3 + i] != '10' and SW_TYPES[i]:
				types.append(SW_TYPES[i])
				
		data.append([date, ','.join(types)])

	return data