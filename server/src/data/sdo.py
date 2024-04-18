from datetime import datetime, timezone
import re, requests
from database import log

cache = {}
DAY = 86400
URL = 'https://cdaw.gsfc.nasa.gov/images/sdo/aia_synoptic/'
jpg_re = re.compile(r'href="(\d{8}_\d{6})_(.+?)\.jpg"')

def scrape_day_list(tstmp, wavelen):
	dt = datetime.utcfromtimestamp(tstmp)
	log.debug('Scraping SDO %s for %s', wavelen, dt)
	url = URL + f'{wavelen}/{dt.year}/{dt.month:02}/{dt.day:02}/'
	res = requests.get(url, timeout=10)
	if res.status_code == 404:
		return []
	if res.status_code != 200:
		log.error('Failed to fetch SDO (%s): %s', res.status_code, url)
		raise ValueError('SDO HTTP '+res.status_code)
	result = []
	for match in jpg_re.findall(res.text):
		adt = datetime.strptime(match[0], '%Y%m%d_%H%M%S')
		ts = adt.replace(tzinfo=timezone.utc).timestamp()
		result.append(ts)
	return result

def fetch_list(t_from, t_to, wavelen=193):
	if wavelen not in cache:
		cache[wavelen] = {}
	t_from = t_from // DAY * DAY
	result = []
	for d_start in range(t_from, t_to, DAY):
		if d_start in cache[wavelen]:
			result.extend(cache[wavelen][d_start])
			continue
		lst = scrape_day_list(d_start, wavelen)
		cache[wavelen][d_start] = lst
		result.extend(lst)
	return result