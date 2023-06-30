from data_series.neutron import database
from scipy import optimize
import numpy as np
import warnings

PERIOD = 3600
BASE_LENGTH = 24

def _determine_base(time, data):
	mean_val = np.nanmean(data, axis=0)
	mean_var = np.nanmean(data / mean_val, axis=1)
	indices = np.where(mean_var[:-1*BASE_LENGTH] > 1)[0]
	if not len(indices): indices = [0]
	deviations = np.array([np.std(data[i:i+BASE_LENGTH], 0) for i in indices])
	mean_std = 1 / np.nanmean(deviations, axis=1)
	weightened_std = mean_std * (mean_var[indices] - 1)
	base_idx = indices[np.argmax(weightened_std)]
	return base_idx, base_idx + BASE_LENGTH

def _filter(time, data):
	variation = data / np.nanmean(data, axis=0) * 100 - 100
	avg_variation = np.nanmedian(variation, axis=1)
	deviation = variation - avg_variation[:,None]
	mask = np.where((deviation > 5) | (deviation < -20)) # meh values
	data[mask] = np.nan
	
	excluded = list()
	for station_i in range(data.shape[1]): # exclude station if >10 spikes
		if len(np.where(mask[1] == station_i)[0]) > 10:
			data[:,station_i] = np.nan
			excluded.append(station_i)
	filtered = np.count_nonzero(~np.isin(mask[1], excluded))
	return time, data, filtered, excluded

def anisotropy_fn(x, a, scale, sx, sy):
	return np.cos(x * a * np.pi / 180 + sx) * scale + sy

def precursor_idx(x, y, amp_cutoff = 1, details = False):
	if not len(y): return None
	amax, amin = x[np.argmax(y)], x[np.argmin(y)]
	approx_dist = np.abs(amax - amin)
	center_target = 180 if approx_dist < 180 else 360
	shift = center_target - (amax + amin) / 2
	x = (x + shift + 360) % 360
	bounds = (approx_dist if approx_dist > 180 else (360-approx_dist)) / 6
	trim = np.where((x > bounds) & (x < 360-bounds))
	try:
		popt, pcov = optimize.curve_fit(anisotropy_fn, x[trim], y[trim])
		angle, scale = abs(popt[0]), abs(popt[1]) * 2
		dists  = np.array([anisotropy_fn(x[trim][j], *popt)-y[trim][j] for j in range(len(trim[0]))])
		# mean_dist = (1.1 - np.mean(np.abs(dists)) / scale) ** 2
		if scale < amp_cutoff or scale > 5 or angle < 1 or angle > 2.5:
			index = 0
		else:
			index = round((scale * angle) ** 2 / 8, 2)
		if details:
			return x, y, shift, popt, index, scale, angle
		return index
	except:
		return None

def calc_index_windowed(time, variations, directions, window, amp_cutoff):
	sorted = np.argsort(directions)
	variations, directions = variations[:,sorted], directions[sorted]
	result = []
	for i in range(window, len(time)):
		x = np.concatenate([directions + time[i-t] * 360 / 86400 for t in range(window)]) % 360
		y = np.concatenate([variations[i-t] for t in range(window)])
		filter = np.isfinite(y)
		x, y = x[filter], y[filter]
		result.append(precursor_idx(x, y, amp_cutoff))
	return time[window:].tolist(), result

def get(t_from, t_to, exclude, details, window, amp_cutoff, user_base, auto_filter):
	if window > 12 or window < 1: window = 3
	if amp_cutoff < 0 or amp_cutoff > 10: amp_cutoff = .7

	stations, directions = zip(*database.select_rsm_stations(t_to, exclude))
	neutron_data = database.fetch((t_from, t_to), stations)
	time, data = np.uint64(neutron_data[:,0]), neutron_data[:,1:]
	
	with warnings.catch_warnings():
		warnings.filterwarnings(action='ignore', message='Mean of empty slice')

		time, data, filtered, excluded = _filter(time, data) if auto_filter else (time, data, 0, [])

		if user_base and user_base >= t_from and user_base <= t_to - PERIOD * BASE_LENGTH:
			user_base = user_base // PERIOD * PERIOD
			idx = (user_base - t_from) // PERIOD
			base_idx = [idx, idx + BASE_LENGTH]
		else:
			base_idx = _determine_base(time, data)

		base_data = data[base_idx[0]:base_idx[1]]
		variation = data / np.nanmean(base_data, axis=0) * 100 - 100
		if details:
			return index_details(time, variation, np.array(directions), int(details), window, amp_cutoff)
		prec_idx = calc_index_windowed(time, variation, np.array(directions), window, amp_cutoff)

	return dict({
		'base': int(time[base_idx[0]]),
		'time': time.tolist(),
		'variation': np.where(~np.isfinite(variation), None, np.round(variation, 2)).tolist(),
		'shift': directions,
		'station': list(stations),
		'precursor_idx': prec_idx,
		'filtered': filtered,
		'excluded': exclude + [stations[i] for i in excluded]
	})

def index_details(time, variations, directions, when, window, amp_cutoff):
	idx = np.where(time == when)[0]
	if not idx: return {}
	sorted = np.argsort(directions)
	variations, directions = variations[:,sorted], directions[sorted]
	x = np.concatenate([directions + time[idx[0]-t] * 360 / 86400 for t in range(window)]) % 360
	y = np.concatenate([variations[idx[0]-t] for t in range(window)])
	filter = np.isfinite(y)
	x, y = x[filter], y[filter]
	res = precursor_idx(x, y, amp_cutoff, details=True)
	if res is None: return {}
	x, y, shift, popt, index, scale, angle = res
	x = (x - shift + 360) % 360
	sorted = np.argsort(x)
	x, y = x[sorted], y[sorted]
	rng = np.arange(0, 360, 1)
	return dict({
		'time': int(time[idx[0]]),
		'x': np.round(x, 3).tolist(),
		'y': np.round(y, 3).tolist(),
		'fnx': rng.tolist(),
		'fny': np.round(anisotropy_fn(rng+shift, *popt), 3).tolist(),
		'index': index,
		'amplitude': scale,
		'angle': angle
	})
