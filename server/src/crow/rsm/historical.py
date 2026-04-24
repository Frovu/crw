import warnings
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from crow.rsm.core import RSMPlotResponse, fetch_counts, filter_variations

HOUR = 3600
BASE_LEN = 24
WINDOW_LEN = 36

MIN_BASE_GAP = BASE_LEN
MAX_BASE_GAP_1 = 24 * 7
MAX_BASE_GAP_2 = 24 * 10
MAX_BASE_GAP = 24 * 14
GOOD_BASE_THRESHOLD = 1.5
DECENT_BASE_THRESHOLD = 1

def _base_rating(data: np.ndarray, vb: np.ndarray):
	result = np.empty(len(data))
	result[-WINDOW_LEN:] = np.nan

	windows = sliding_window_view(data, window_shape=(WINDOW_LEN, data.shape[1]))

	std = np.std(windows, axis=2)
	mean_std = 1 / np.nanmean(std, axis=2)[:,0]

	avg_vb_shifted = np.nanmean(sliding_window_view(vb, window_shape=WINDOW_LEN), axis=1)
	avg_vb_shifted[~np.isfinite(avg_vb_shifted)] = 2

	result[:-WINDOW_LEN+1] = mean_std / avg_vb_shifted

	return result

def fetch_base_rating(t_from: int, t_to: int, vb: np.ndarray, ret_rating=False):
	data, stations = fetch_counts(t_from, t_to)
	time, data = data[:,0].astype(int), data[:,1:]

	rating = _base_rating(data, vb)

	if ret_rating:
		return rating
	
	base = np.full_like(rating, 0)

	idx = 0
	get_next_max = lambda window: MIN_BASE_GAP + BASE_LEN + np.argmax(rating[idx+MIN_BASE_GAP+BASE_LEN:idx+window-MIN_BASE_GAP-BASE_LEN])
	while idx < len(rating) - MAX_BASE_GAP_1:
		next_max = get_next_max(MAX_BASE_GAP_1)
		if rating[idx+next_max] < GOOD_BASE_THRESHOLD or next_max == MAX_BASE_GAP_1 - BASE_LEN - MIN_BASE_GAP - 1:
			next_max = get_next_max(MAX_BASE_GAP_2)
		if rating[idx+next_max] < DECENT_BASE_THRESHOLD or next_max == MAX_BASE_GAP_2 - BASE_LEN - MIN_BASE_GAP - 1:
			next_max = get_next_max(MAX_BASE_GAP)

		idx += next_max
		base[idx:idx+BASE_LEN] = .9

	return base


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