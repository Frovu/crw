import warnings
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from crow.rsm.core import RSMPlotResponse, fetch_counts, filter_variations

HOUR = 3600
BASE_LEN = 24
WINDOW_LEN = 36

# def fetch_hour_distribution(tstmp: int):

def _base_rating(data: np.ndarray, vb, ret_rating=False):
	result = np.empty(len(data))
	result[-WINDOW_LEN:] = np.nan

	windows = sliding_window_view(data, window_shape=(WINDOW_LEN, data.shape[1]))

	std = np.std(windows, axis=2)
	mean_std = 1 / np.nanmean(std, axis=2)[:,0]

	avg_vb_shifted = np.nanmean(sliding_window_view(vb, window_shape=WINDOW_LEN), axis=1)
	avg_vb_shifted[~np.isfinite(avg_vb_shifted)] = 2

	result[:-WINDOW_LEN+1] = mean_std / avg_vb_shifted if not ret_rating else mean_std

	return result

def fetch_base_rating(t_from: int, t_to: int, vb: np.ndarray, ret_rating=False):
	data, stations = fetch_counts(t_from, t_to)
	time, data = data[:,0].astype(int), data[:,1:]

	return _base_rating(data, vb, ret_rating)


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