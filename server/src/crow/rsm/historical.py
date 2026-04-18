import warnings
import numpy as np
from crow.rsm.core import RSMPlotResponse, fetch_counts, filter_variations

HOUR = 3600
BASE_LEN = 24

# def fetch_hour_distribution(tstmp: int):

def fetch_variations_data(t_from: int, t_to: int, event_starts: list[int]):
	data, stations = fetch_counts(t_from, t_to)
	time, data = data[:,0].astype(int), data[:,1:]
	
	t_from = time[0]

	result = np.full_like(data, np.nan)
	event_idxes = np.array(event_starts) // HOUR - t_from // HOUR

	if len(event_idxes) < 1:
		event_idxes = [0]

	with warnings.catch_warnings():
		warnings.filterwarnings(action='ignore', message='Mean of empty slice')

		cur = 0
		for i, event_idx in enumerate(event_idxes):
			base_start = max(0, event_idx - BASE_LEN )
			base_data = data[base_start : base_start + BASE_LEN + 2]
			base = np.nanmean(base_data, axis=0)
			part_end = event_idxes[i + 1] if i + 1 < len(event_idxes) else len(result)
			result[cur:part_end] = data[cur:part_end] / base * 100 - 100
			cur = part_end

	filter_variations(result)

	return time, result, stations

def fetch_variations(t_from: int, t_to: int, event_starts: list[int]):
	time, result, stations = fetch_variations_data(t_from, t_to, event_starts)
	result = np.where(~np.isfinite(result.T), None, np.round(result.T, 2)).tolist() # type: ignore
	return RSMPlotResponse(time.tolist(), result, stations).as_dict()