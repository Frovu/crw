from datetime import datetime, timezone
import re, requests
from database import log

cache = {}
DAY = 86400
URL = 'https://cdaw.gsfc.nasa.gov/images/'
jpg_re = re.compile(r'href="(\d{8}_\d{6})_(.+?)\.(png|jpg)"')

# supported srcs: AIA 094, AIA ..., AIA 193 diff, LASCO C2, LASCO C3
def scrape_day_list(tstmp, src):
	dt = datetime.utcfromtimestamp(tstmp)
	log.debug('Scraping images %s for %s', src, dt)
	lasco = 'LASCO' in src
	dp = ('soho/lasco' if lasco else ('sdo/aia_synoptic_rdf/' if 'diff' in src else 'sdo/aia_synoptic_nrt/') + src.split()[1])
	url = f'{URL}/{dp}/{dt.year}/{dt.month:02}/{dt.day:02}/'
	res = requests.get(url, timeout=10)
	if res.status_code == 404:
		return []
	if res.status_code != 200:
		log.error('Failed to fetch images list (%s): %s', res.status_code, url)
		raise ValueError('HTTP '+res.status_code)
	result = []
	for match in jpg_re.findall(res.text):
		if lasco and src[-1] not in match[1]:
			continue
		adt = datetime.strptime(match[0], '%Y%m%d_%H%M%S')
		ts = adt.replace(tzinfo=timezone.utc).timestamp()
		result.append(ts)
	return result

def fetch_list(t_from, t_to, source='AIA 193'):
	if source not in cache:
		cache[source] = {}
	t_from = t_from // DAY * DAY
	result = []
	for d_start in range(t_from, t_to, DAY):
		if d_start in cache[source]:
			result.extend(cache[source][d_start])
			continue
		lst = scrape_day_list(d_start, source)
		cache[source][d_start] = lst
		result.extend(lst)
	return result