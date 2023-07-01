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
	std = np.nanstd(data, axis=1)[:,None]
	med = np.nanmean(data, axis=1)[:,None]
	dist = np.abs(med - data) / std
	mask = np.where(dist > 3) # if dist to mean > 3 sigma
	data[mask] = np.nan
	
	fl_ids, fl_counts = np.unique(mask[1], return_counts=True)
	max_errors = data.shape[0] // 10
	excluded = fl_ids[fl_counts > max_errors]
	filtered = np.sum(fl_counts[fl_counts <= max_errors])
	data[:,excluded] = np.nan
	return filtered, excluded

def ani_fn_simple_precursor_cos_0(x, a, scale, sx, sy):
	return np.cos(x * a * np.pi / 180 + sx) * scale + sy

def ani_fn_harmonic(x, a0, a1, p1, a2, p2):
	return a0 + a1 * np.cos(x / + p1) + a2 * np.sin(x + p2)

def precursor_idx0(x, y):
	popt = curve_fit_shifted(x, y, ani_fn_simple_precursor_cos_0, trim_bounds=1/6)
	if popt is None: return None, popt
	angle, scale = abs(popt[0]), abs(popt[1]) * 2
	if scale < .5 or scale > 5 or angle < 1 or angle > 2.5:
		return 0, popt
	return round((scale * angle) ** 2 / 8, 2), popt

def precursor_idx(x, y):
	return precursor_idx0(x, y)

def curve_fit_shifted(x, y, fn, trim_bounds=0):
	if not len(y): return None
	amax, amin = x[np.argmax(y)], x[np.argmin(y)]
	approx_dist = np.abs(amax - amin)
	center_target = 180 if approx_dist < 180 else 360
	shift = center_target - (amax + amin) / 2
	x = (x + shift + 360) % 360

	if trim_bounds:
		bounds = (approx_dist if approx_dist > 180 else (360-approx_dist)) * trim_bounds
		trim = np.where((x > bounds) & (x < 360-bounds))
		x, y = x[trim], y[trim]
	try:
		popt, pcov = optimize.curve_fit(fn, x, y)
		print(popt)
		return [*popt, x, y] # FIXME
	except:
		return None

def get(t_from, t_to, exclude, details, window, user_base, auto_filter):
	if window > 12 or window < 1: window = 3

	stations, directions = zip(*database.select_rsm_stations(t_to, exclude))
	neutron_data = database.fetch((t_from, t_to), stations)
	time, data = np.uint64(neutron_data[:,0]), neutron_data[:,1:]
	
	with warnings.catch_warnings():
		warnings.filterwarnings(action='ignore', message='Mean of empty slice')

		if user_base and user_base >= t_from and user_base <= t_to - PERIOD * BASE_LENGTH:
			user_base = user_base // PERIOD * PERIOD
			idx = (user_base - t_from) // PERIOD
			base_idx = [idx, idx + BASE_LENGTH]
		else:
			base_idx = _determine_base(time, data)

		base_data = data[base_idx[0]:base_idx[1]]
		variation = data / np.nanmean(base_data, axis=0) * 100 - 100

		filtered, excluded = _filter(time, variation) if auto_filter else (0, [])

		def get_xy(i):
			x = np.concatenate([directions + time[i-t] * 360 / 86400 for t in range(window)]) % 360
			y = np.concatenate([variation[i-t] for t in range(window)])
			flt = np.isfinite(y)
			return x[flt], y[flt]
		
		if details:
			ii = (details - t_from) // PERIOD
			if ii < 0 or ii >= len(time): return {}
			return index_details(time[ii], *get_xy(ii))
		
		prec_idx = np.full_like(time, np.nan, dtype='f8')
		for i in range(window - 1, len(prec_idx)):
			prec_idx[i] = precursor_idx(*get_xy(i))[0]
			
	return dict({
		'base': int(time[base_idx[0]]),
		'time': time.tolist(),
		'variation': np.where(~np.isfinite(variation), None, np.round(variation, 2)).tolist(),
		'shift': directions,
		'station': list(stations),
		'precursor_idx': [time.tolist(), np.where(~np.isfinite(prec_idx), None, np.round(prec_idx, 2)).tolist()],
		'filtered': int(filtered),
		'excluded': exclude + [stations[i] for i in excluded]
	})

def index_details(time, x, y):
	val, popt = precursor_idx(x, y)
	fit_success = None if popt is None else True
	x, y = (popt or [x, y])[-2:]
	sort = np.argsort(x)
	x, y = x[sort], y[sort]
	x_range = np.arange(0, 360, 1)
	y_res = fit_success and ani_fn_simple_precursor_cos_0(x_range, *popt[:-2])
	amplitude = fit_success and abs(popt[1]) * 2

	return dict({
		'time': int(time),
		'x': np.round(x, 3).tolist(),
		'y': np.round(y, 3).tolist(),
		'fnx': x_range.tolist(),
		'fny': fit_success and np.round(y_res, 3).tolist(),
		'index': val,
		'amplitude': amplitude,
	})
