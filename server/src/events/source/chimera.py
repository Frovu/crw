
from datetime import datetime, timezone
import re, requests
from database import log
from concurrent.futures import ThreadPoolExecutor

from events.table_structure import ColumnDef as Col
from events.source.donki import parse_coords

cache = {}
DAY = 86400
URL = 'https://solarmonitor.org/'
img_re = re.compile(r'href="saia_chimr_ch_(\d{8}_\d{6})\.png"')

TABLE = 'chimera'
COLS = [
	Col(TABLE, 'id', data_type='integer', description='CHIMERA number'),
	Col(TABLE, 'xcen'),
	Col(TABLE, 'ycen'),
	Col(TABLE, 'lat'),
	Col(TABLE, 'lon'),
	Col(TABLE, 'width_text', data_type='text', pretty_name='width'),
	Col(TABLE, 'width'),
	Col(TABLE, 'area'),
	Col(TABLE, 'area_percent', pretty_name='area', description='Area in % of solar disc'),
	Col(TABLE, 'b', pretty_name='B'),
	Col(TABLE, 'b_plus'),
	Col(TABLE, 'b_minus'),
	Col(TABLE, 'b_max'),
	Col(TABLE, 'b_min'),
	Col(TABLE, 'tot_b_plus'),
	Col(TABLE, 'tot_b_minus'),
	Col(TABLE, 'phi', pretty_name='Φ', description='Φ, Mx * 1e20'),
	Col(TABLE, 'phi_plus'),
	Col(TABLE, 'phi_minus'),
]

def scrape_chimera_images(dt):
	url = f'{URL}data/{dt.year}/{dt.month:02}/{dt.day:02}/pngs/saia/'
	res = requests.get(url, timeout=10)
	if res.status_code == 404:
		return []
	if res.status_code != 200:
		log.error('Failed to fetch images list (%s): %s', res.status_code, url)
		raise ValueError('HTTP '+res.status_code)
	result = []
	for match in img_re.findall(res.text):
		adt = datetime.strptime(match, '%Y%m%d_%H%M%S')
		ts = adt.replace(tzinfo=timezone.utc).timestamp()
		result.append(int(ts))
	return result

def soft_float(s):
	try:
		return float(s)
	except:
		return None

def scrape_chimera_holes(dt):
	url = f'{URL}data/{dt.year}/{dt.month:02}/{dt.day:02}/meta/arm_ch_summary_{dt.year}{dt.month:02}{dt.day:02}.txt'
	res = requests.get(url, timeout=10)
	if res.status_code == 404:
		return []
	if res.status_code != 200:
		log.error('Failed to fetch info (%s): %s', res.status_code, url)
		raise ValueError('HTTP '+res.status_code)
	result = []
	for line in res.text.splitlines()[2:]:
		l = [line[:3].strip()] + [line[i:i+11].strip() for i in range(3, len(line), 11)]
		cid = int(l[0])
		x, y = soft_float(l[1]), soft_float(l[2])
		lat, lon = parse_coords(l[3], reverse=True)
		w = l[12]
		row = [cid, x, y, lat, lon, w, *[soft_float(i) for i in l[13:]]]
		row[-3] /= 1e20
		result.append(row)
	return result

def _get_day(d_start):
	if d_start not in cache:
		dt = datetime.utcfromtimestamp(d_start)
		log.debug('Scraping CHIMERA holes for %s', dt)
		imgs = scrape_chimera_images(dt)
		holes = scrape_chimera_holes(dt)
		cache[d_start] = (imgs, holes)
	else:
		imgs, holes = cache[d_start]
	return imgs, holes

def fetch_list(t_from, t_to):
	t_from = t_from // DAY * DAY
	holes_lists = {}
	images = []
	with ThreadPoolExecutor() as executor:
		res = executor.map(_get_day, range(t_from, t_to, DAY))
	for imgs, holes in res:
		if len(imgs) > 0:
			holes_lists[imgs[-1]] = holes
		images.extend(imgs)
	return {
		'holes': holes_lists,
		'images': images,
		'columns': [c.as_dict() for c in COLS]
	}