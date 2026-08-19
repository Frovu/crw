import requests
from datetime import datetime, timezone
from threading import Lock
from concurrent.futures import ThreadPoolExecutor
from data.omni.variables import GROUP, SOURCE
from database import log, upsert_many
from data.omni.obtain import obtain

kyoto_url = 'https://wdc.kugi.kyoto-u.ac.jp/dst_realtime'
gfz_url = 'https://kp.gfz.de/fileadmin/files_for_gfz_cms/qlyymm.tab'

NOAA_REFETCH_WINDOW = 7 * 24 * 3600
REALTIME_FETCH_DELAY = 10 * 60

last_fetch_time = 0
lock = Lock()

def obtain_kyoto():
	date = datetime.now(timezone.utc)
	dt = date.strftime('%Y%m')
	url = f'{kyoto_url}/{dt}/dst{dt[2:]}.for.request'
	res = requests.get(url)

	if res.status_code != 200:
		return log.error('realtime/kyoto: %s HTTP %s', url, str(res.status_code))

	data = []
	for line in res.text.splitlines():
		if not line: break
		day = int(line[8:10])
		for hour in range(24):
			time = datetime(date.year, date.month, day, hour, tzinfo=timezone.utc)
			idx = 20+hour*4
			value = int(line[idx:idx+4])
			if value == 9999: break
			data.append((time, value))

	log.info('realtime/kyoto: fetched [%s] Dst values up to %s', len(data), str(data[-1][0]) if data else '')
	upsert_many('omni', ['time', 'Dst'], data, write_values=True, schema='public')

def obtain_gfz():
	res = requests.get(gfz_url)
	if res.status_code != 200:
		return log.error('realtime/gfz: HTTP %s', str(res.status_code))

	data = []
	for line in res.text.splitlines():
		if not line: break
		split = line.split()
		date = datetime.strptime(split[0], '%y%m%d').replace(tzinfo=timezone.utc)

		for h3i, val in enumerate(split[1:8]):
			for hour in range(h3i*3, h3i*3+3):
				tst = date.replace(hour=hour)
				if tst > datetime.now(timezone.utc): break
				value = int(val[0]) * 10 + {'-': -3, 'o': 0, '+': 3}[val[1]]
				data.append((tst, value))

	log.info('realtime/gfz: fetched [%s] Kp values up to %s', len(data), str(data[-1][0]) if data else '')
	upsert_many('omni', ['time', 'Kp'], data, write_values=True, schema='public')

def obtain_noaa_sw():
	now = int(datetime.now(timezone.utc).timestamp())
	interval = (now - NOAA_REFETCH_WINDOW, now)
	obtain(interval, [GROUP.IMF, GROUP.SW], SOURCE.NOAA, True)

def fetch_realtime():
	global last_fetch_time
	with lock:
		now = datetime.now().timestamp()
		if now - last_fetch_time < REALTIME_FETCH_DELAY:
			return
		last_fetch_time = now
		with ThreadPoolExecutor() as executor:
			list(executor.map(lambda f: f(), [obtain_kyoto, obtain_gfz, obtain_noaa_sw]))
