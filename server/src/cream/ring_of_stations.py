from math import ceil
import warnings
from dataclasses import dataclass
from scipy import optimize
import numpy as np

from database import log
from data.neutron import core as database
from cream import gsm

pi = np.pi
PERIOD = 3600
BASE_LENGTH = 24

def compute_a0r(data):
	return np.nanmean(data, axis=1)

def _determine_base(data):
	mean_val = np.nanmean(data, axis=0)
	mean_var = np.nanmean(data / mean_val, axis=1)
	indices = np.where(mean_var[:-1*BASE_LENGTH] > 1)[0]
	if not len(indices):
		indices = [0]
	deviations = np.array([np.std(data[i:i+BASE_LENGTH], 0) for i in indices])
	mean_std = 1 / np.nanmean(deviations, axis=1)
	weightened_std = mean_std * (mean_var[indices] - 1)
	base_idx = indices[np.argmax(weightened_std)]
	return base_idx, base_idx + BASE_LENGTH

def _filter(data):
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

@dataclass
class AnisotropyFn:
	fn: callable
	phases: [int]
	bounds: [int] = (-np.inf, np.inf)
ANI = {
	'harmonic': AnisotropyFn(lambda x, a0, a1, p1, a2, p2:
		a0 + a1 * np.cos(x * pi / 180 + p1) + a2 * np.sin(x * pi / 90 + p2),
		[2, 4]),
	'simple_precursor_cos': AnisotropyFn(lambda x, freq, a1, p1, a0: 
		np.cos(x * freq * pi / 180 + p1) * a1 + a0,
		[2]),
	'h1+decrease': AnisotropyFn(lambda x, a0, a1, p1, a2, p2:
		a0 + a1 * np.cos(x * pi / 180 + p1) + \
			 a2 * np.exp(-((x * pi / 180 - p2) ** 2)) ,
		[2, 4]),
	'harmonic_decrease_biased': AnisotropyFn(lambda x, a0, a1, p1, a2, p2:
		a0 + a1 * np.cos(x * pi / 180 + p1) + \
			 np.abs(a2) * np.cos(x * pi / 90  + p2 * 2) * (-np.exp(-2 * ((((x / 180 * pi + p2) % (2 * pi)) - pi) ** 2)) - 1 / 2 / pi) ,
		[2, 4]),
	'harmonic_narrow_biased': AnisotropyFn(lambda x, a0, a1, p1, a2, p2:
		a0 + a1 * np.cos(x * pi / 180 + p1) + \
			 a2 / 0.58 * np.sin(x * pi / 90  + p2 * 2) * (-np.exp(-6 * ((((x / 360 * pi + p2 / 2) % (2 * pi)) - pi) ** 2))) ,
		[2, 4])
}

def precursor_idx0(x, y, curve):
	popt = curve_fit_shifted(x, y, curve, trim_bounds=1/6)
	if popt is None:
		return None, popt
	angle, scale = abs(popt[0]), abs(popt[1]) * 2
	if scale < .5 or scale > 5 or angle < 1 or angle > 2.5:
		return 0, popt
	return round((scale * angle) ** 2 / 8, 2), popt

def precursor_idx(x, y, curve=ANI['simple_precursor_cos']):
	return precursor_idx0(x, y, curve)

def curve_fit_shifted(x, y, curve: AnisotropyFn, trim_bounds=0):
	if not len(y):
		return None
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
		popt, pcov = optimize.curve_fit(curve.fn, x, y, bounds=curve.bounds)
		# print(np.round(popt,3).tolist())
		popt[curve.phases] += shift * pi / 180
		return popt
	except BaseException as exc:
		if 'maxfev =' not in str(exc):
			log.error(exc)
		return None

def get(t_from, t_to, exclude, details, window, user_base, auto_filter):
	if window > 12 or window < 1:
		window = 3

	stations_q = database.get_stations(group_partial=True) # FIXME
	req_stations, directions = zip(*[(s.id, s.drift_longitude) for s in stations_q])

	stations, neutron_data = database.fetch((t_from, t_to), req_stations)
	directions = [directions[i] for i, st in enumerate(req_stations) if st in stations]
	time, data = np.array(neutron_data[:,0], dtype='i8'), neutron_data[:,1:]
	
	with warnings.catch_warnings():
		warnings.filterwarnings(action='ignore', message='Mean of empty slice')

		if user_base and user_base >= t_from and user_base <= t_to - PERIOD * BASE_LENGTH:
			user_base = user_base // PERIOD * PERIOD
			idx = (user_base - t_from) // PERIOD
			base_idx = [idx, idx + BASE_LENGTH]
		else:
			base_idx = _determine_base(data)

		base_data = data[base_idx[0]:base_idx[1]]
		variation = data / np.nanmean(base_data, axis=0) * 100 - 100

		filtered, excluded = _filter(variation) if auto_filter else (0, [])
		
		def get_xy(i):
			x = np.concatenate([directions + time[i-t] * 360 / 86400 for t in range(window)]) % 360
			y = np.concatenate([variation[i-t] for t in range(window)])
			flt = np.isfinite(y)
			return x[flt], y[flt]
		
		if details:
			ii = ceil((details - t_from) / PERIOD)
			if ii < 0 or ii >= len(time):
				return {}
			return index_details(time[ii], *get_xy(ii))
		
		prec_idx = np.full_like(time, np.nan, dtype='f8')
		for i in range(window - 1, len(prec_idx)):
			prec_idx[i] = precursor_idx(*get_xy(i))[0]
	
	a0r = compute_a0r(variation)
	gsm_res, _ = gsm.select([int(time[0]), int(time[-1])], 'A10m')
	a0m = None if len(gsm_res) != len(a0r) else gsm_res[:,1]
	if a0m is not None:
		base = np.nanmean(a0m[base_idx[0]:base_idx[1]])
		a0m = (a0m - base) / (1 + base / 100)
		a0m = np.where(~np.isfinite(a0m), None, np.round(a0m, 2)).tolist()
			
	return dict({
		'base': int(time[base_idx[0]]),
		'time': time.tolist(),
		'precursor_idx': np.where(~np.isfinite(prec_idx), None, np.round(prec_idx, 2)).tolist(),
		'variation': np.where(~np.isfinite(variation), None, np.round(variation, 2)).tolist(),
		'a0r': np.where(~np.isfinite(a0r), None, np.round(a0r, 2)).tolist(),
		'a0m': a0m,
		'shift': directions,
		'station': list(stations),
		'filtered': int(filtered),
		'excluded': exclude + [stations[i] for i in excluded]
	})

def index_details(time, x, y):
	curve = ANI['simple_precursor_cos']
	val, popt = precursor_idx(x, y, curve)
	fit_success = None if popt is None else True

	sort = np.argsort(x)
	x, y = x[sort], y[sort]
	x_range = np.arange(0, 360, 1)
	y_res = fit_success and curve.fn(x_range, *popt)
	# amplitude = fit_success and abs(popt[1]) * 2

	# curve2 = ANI['harmonic_decrease_biased']
	curve2 = ANI['harmonic']
	popt = curve_fit_shifted(x, y, curve2)

	return dict({
		'time': int(time),
		'x': np.round(x, 3).tolist(),
		'y': np.round(y, 3).tolist(),
		'fnx': x_range.tolist(),
		'fny': fit_success and np.round(y_res, 3).tolist(),
		'fny2': None if popt is None else np.round(curve2.fn(x_range, *popt), 3).tolist(),
		'index': val,
		'a1': None if popt is None else 2*abs(popt[1]),
		'a2': None if popt is None else 2*abs(popt[3])
	})
