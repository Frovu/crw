
from dataclasses import dataclass
from typing import Callable
import traceback

from scipy import optimize
import numpy as np

from data.neutron.core import Station
from database import log

pi = np.pi

@dataclass
class Model:
	fn: Callable
	phases: list[int]
	bounds: tuple[float, float] = (-np.inf, np.inf)

MODELS = {
	'harmonic': Model(lambda x, a0, a1, p1, a2, p2:
		a0 + a1 * np.cos(x * pi / 180 + p1) + a2 * np.sin(x * pi / 90 + p2),
		[2, 4]),
	'simple_precursor_cos': Model(lambda x, freq, a1, p1, a0: 
		np.cos(x * freq * pi / 180 + p1) * a1 + a0,
		[2]),
	'h1+decrease': Model(lambda x, a0, a1, p1, a2, p2:
		a0 + a1 * np.cos(x * pi / 180 + p1) + \
			 a2 * np.exp(-((x * pi / 180 - p2) ** 2)) ,
		[2, 4]),
	'harmonic_decrease_biased': Model(lambda x, a0, a1, p1, a2, p2:
		a0 + a1 * np.cos(x * pi / 180 + p1) + \
			 np.abs(a2) * np.cos(x * pi / 90  + p2 * 2) * (-np.exp(-2 * ((((x / 180 * pi + p2) % (2 * pi)) - pi) ** 2)) - 1 / 2 / pi) ,
		[2, 4]),
	'harmonic_narrow_biased': Model(lambda x, a0, a1, p1, a2, p2:
		a0 + a1 * np.cos(x * pi / 180 + p1) + \
			 a2 / 0.58 * np.sin(x * pi / 90  + p2 * 2) * (-np.exp(-6 * ((((x / 360 * pi + p2 / 2) % (2 * pi)) - pi) ** 2))) ,
		[2, 4])
}

def curve_fit_shifted(x, y, model: Model, trim_bounds=0):
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
		popt, pcov = optimize.curve_fit(model.fn, x, y, bounds=model.bounds)
		# print(np.round(popt,3).tolist())
		popt[model.phases] += shift * pi / 180
		return popt
	except BaseException as exc:
		if 'maxfev =' not in str(exc):
			traceback.print_exc()
			log.error(exc)
		return None
	
def fit_model(time: np.ndarray, variations: np.ndarray, bases: np.ndarray, stations: list[Station], model=MODELS['harmonic'], window=3):
	drifts = np.array([s.drift_longitude for s in stations])
	alons = np.array([drifts + tm / 86400 * 360 for tm in time]) % 360
	nstations = variations.shape[1]
	nparams = 5

	result = np.full((len(time), nparams), np.nan)

	for i in range(window-1, len(time)):
		x = alons[i-window+1:i+1].reshape(nstations * window)
		y = variations[i-window+1:i+1].reshape(nstations * window)
		filter = np.isfinite(y)
		popt = curve_fit_shifted(x[filter], y[filter], model)
		if popt is not None:
			result[i,:nparams] = popt[:nparams]

	# erase hours at base edge
	for base in bases:
		result[base:base+window-1] = np.nan

	return result

def plot_model_result(popt: np.ndarray, model=MODELS['harmonic']) -> np.ndarray | None:
	x_range = np.arange(0, 360, 1)
	if np.any(~np.isfinite(popt)):
		return None

	return model.fn(x_range, *popt).round(3)