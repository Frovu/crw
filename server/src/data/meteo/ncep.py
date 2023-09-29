
from ftplib import FTP
import logging, os
from threading import Thread
from datetime import datetime, timedelta, timezone
from scipy import interpolate, ndimage
from netCDF4 import Dataset, num2date, date2index
import numpy as np

log = logging.getLogger('crdt')
last_downloaded = [datetime(2000, 1, 1)]
download_progress = {}

PATH = '../tmp/ncep'
HOUR = 3600
MODEL_PERIOD = 6 * HOUR
MODEL_EPOCH = datetime(1948, 1, 1)
LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 30, 20, 10]

if not os.path.exists(PATH):
	os.makedirs(PATH)

def file_name(year):
	return f'air.{year}.nc'

def _download(year):
	try:
		fname = file_name(year)
		ftp = FTP('ftp2.psl.noaa.gov')
		log.debug('FTP login: %s', ftp.login())
		log.info(f'Downloading file: {fname}')
		ftp.cwd('Datasets/ncep.reanalysis/pressure')
		download_progress[year] = [0, ftp.size(fname)]
		if year == datetime.now().year:
			last_downloaded[0] = datetime.now()
		with open(os.path.join(PATH, fname), 'wb') as file:
			def write(data):
				file.write(data)
				download_progress[year][0] += len(data)
			ftp.retrbinary(f'RETR {fname}', write)
		log.info(f'Downloaded file: {fname}')
	except Exception as err:
		os.remove(os.path.join(PATH, file_name(year)))
		log.error(str(err))
		raise err

def _parse_file(dt_from, dt_to, include_last=True):
	try:
		year = dt_from.year
		data = Dataset(os.path.join(PATH, file_name(year)), 'r')
		assert 'NMC reanalysis' in data.title
		log.debug(f'Reading ncep: {year} from {dt_from} to {dt_to}')
		times = data.variables['time']
		start_idx = date2index(dt_from, times)
		end_idx = None if dt_to >= num2date(times[-1], times.units) else (date2index(dt_to, times) + (1 if include_last else 0))
		time_values = num2date(times[start_idx:end_idx], units=times.units,
			only_use_cftime_datetimes=False, only_use_python_datetimes=True)
		epoch_times = np.array([dt.replace(tzinfo=timezone.utc).timestamp() for dt in time_values], dtype='f8')
		return epoch_times, data.variables['air'][start_idx:end_idx]
	except Exception as err:
		os.remove(os.path.join(PATH, file_name(year)))
		log.error(str(err))
		raise err

def ensure_downloaded(dt_from, dt_to):
	progress = {}
	now = datetime.now()
	for year in range(dt_from.year, dt_to.year + 1):
		progr = download_progress.get(year)
		value = progr and progr[0] / progr[1]
		if progr and value < 1:
			progress[year] = value
		elif (year == now.year and now - last_downloaded[0] > timedelta(hours=2)) \
				or not os.path.exists(os.path.join(PATH, file_name(year))):
			Thread(target=_download, args=(year,)).start()
			download_progress[year] = [0, 1]
			progress[year] = 0
	return progress if len(progress) > 0 else None

# transform geographical coords to index coords
def _get_coords(lat, lon, resolution):
	lat_i = interpolate.interp1d([90, -90], [0, 180 // resolution])
	lon_i = interpolate.interp1d([0,  360], [0, 360 // resolution])
	return [[lat_i(lat)], [lon_i((lon + 360) % 360)]] # lon: [-180;180]->[0;360]

def _approximate_for_point(data, lat, lon, resolution=2.5):
	coords = _get_coords(lat, lon, resolution)
	approximated = np.empty(data.shape[:2])
	for i in range(data.shape[0]):
		for j in range(data.shape[1]):
			approximated[i][j] = ndimage.map_coordinates(data[i][j], coords, mode='wrap')
	return approximated

# 6h model resolution -> 1h resolution
def _interpolate_time(times, data):
	new_times = np.arange(times[0], times[-1] + HOUR, HOUR)
	result = np.empty((new_times.shape[0], data.shape[1]))
	for level_col in range(data.shape[1]): # interpolate each level separately
		old_line = data[:,level_col]
		spline = interpolate.splrep(times, old_line, s=0)
		result[:,level_col] = interpolate.splev(new_times, spline)
	return new_times, result

def _t_mass_average(data):
	diff = np.abs(np.diff(LEVELS)) / np.max(LEVELS)
	return np.array([np.sum(diff * ((x[:-1] + x[1:]) / 2)) for x in data])


def obtain(t_interval, lat, lon):
	q_from, q_to = [datetime.utcfromtimestamp(t // MODEL_PERIOD * MODEL_PERIOD) for t in t_interval]
	dt_from, dt_to = [
		max(q_from, MODEL_EPOCH),
		min(q_to, datetime.now())
	]
	if dt_to <= dt_from:
		return None, None

	if progr := ensure_downloaded(dt_from, dt_to):
		return progr, None

	log.info(f"NCEP: Obtaining ({lat},{lon}) {dt_from} to {dt_to}")
	if dt_from.year == dt_to.year:
		results = [_parse_file(dt_from, dt_to)]
	else:
		year = dt_from.year + 1
		results = [_parse_file(dt_from, datetime(year, 1, 1), include_last=False)]
		results += [_parse_file(datetime(y, 1, 1), datetime(y + 1, 1, 1), include_last=False)
			for y in range(year, dt_to.year)]
		results += [_parse_file(datetime(dt_to.year, 1, 1), dt_to, include_last=True)]

	times_6h = np.concatenate([r[0] for r in results])
	data = np.concatenate([r[1] for r in results])
	log.debug(f"NCEP: Retrieved [{data.shape[0]}] ({lat},{lon}) {dt_from} to {dt_to}")
	approximated = _approximate_for_point(data, lat, lon)
	log.debug(f"NCEP/NCAR: Approximated ({lat},{lon}) {dt_from} to {dt_to}")
	times_1h, result = _interpolate_time(times_6h, approximated)
	log.debug(f"NCEP/NCAR: Interpolated [{result.shape[0]}] ({lat},{lon}) {dt_from} to {dt_to}")
	t_m = np.round(_t_mass_average(result), 2)
	log.debug(f"NCEP/NCAR: T_m [{t_m.shape[0]}] ({lat},{lon}) {dt_from} to {dt_to}")

	return None, np.column_stack((times_1h, t_m, result))
	