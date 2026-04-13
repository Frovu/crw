
from dataclasses import dataclass, asdict
import numpy as np
import warnings, ts_type

from data.neutron import core as database
from data.neutron.core import Station

HOUR = 3600
BASE_LEN_H = 24


def _determine_base(data):
	mean_val = np.nanmean(data, axis=0)
	mean_var = np.nanmean(data / mean_val, axis=1)
	indices = np.where(mean_var[:-1*BASE_LEN_H] > 1)[0]
	if not len(indices):
		indices = [0]
	deviations = np.array([np.std(data[i:i+BASE_LEN_H], 0) for i in indices])
	mean_std = 1 / np.nanmean(deviations, axis=1)
	weightened_std = mean_std * (mean_var[indices] - 1)
	base_idx = indices[np.argmax(weightened_std)]
	return base_idx, base_idx + BASE_LEN_H

def fetch_counts(t_from: int, t_to: int):
	stations = database.get_stations(group_partial=True)
	data = database.fetch((t_from, t_to), stations)
	data = np.array(data, dtype=np.float64)			
	return data, stations

def fetch_variations(t_from: int, t_to: int, user_base: int | None = None):
	data, stations = fetch_counts(t_from, t_to)
	time, data = data[:,0].astype(int), data[:,1:]

	with warnings.catch_warnings():
		warnings.filterwarnings(action='ignore', message='Mean of empty slice')

		if user_base and user_base >= t_from and user_base <= t_to - HOUR * BASE_LEN_H:
			user_base = user_base // HOUR * HOUR
			idx = (user_base - t_from) // HOUR
			base_idx = [idx, idx + BASE_LEN_H]
		else:
			base_idx = _determine_base(data)

		base_data = data[base_idx[0]:base_idx[1]]
		variations = data / np.nanmean(base_data, axis=0) * 100 - 100
	
		_filter(variations)

	variations = np.where(~np.isfinite(variations), None, np.round(variations, 2)).tolist() # type: ignore
	return asdict(RSMPlotResponse(time[base_idx[0]], time.tolist(), variations, stations))