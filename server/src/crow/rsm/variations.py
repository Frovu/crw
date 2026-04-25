import warnings
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

HOUR = 3600
BASE_LEN = 24
WINDOW_LEN = 36

MAX_BASE_GAP_1 = 24 * 7
MAX_BASE_GAP_2 = 24 * 9
MAX_BASE_GAP = 24 * 14
GOOD_BASE_THRESHOLD = 1.5
DECENT_BASE_THRESHOLD = 1

def compute_sw_vb(v: np.ndarray, b: np.ndarray):
	return v / 400 * b / 5

def compute_base_rating(counts: np.ndarray, sw_vb: np.ndarray):
	result = np.empty(len(counts))
	result[-WINDOW_LEN:] = np.nan

	windows = sliding_window_view(counts, window_shape=(WINDOW_LEN, counts.shape[1]))

	std = np.std(windows, axis=2)
	mean_std = 1 / np.nanmean(std, axis=2)[:,0]

	avg_vb_shifted = np.nanmean(sliding_window_view(sw_vb, window_shape=WINDOW_LEN), axis=1)
	avg_vb_shifted[~np.isfinite(avg_vb_shifted)] = 2

	result[:-WINDOW_LEN+1] = mean_std / avg_vb_shifted

	return result

def place_bases(counts: np.ndarray, sw_vb: np.ndarray):
	rating = compute_base_rating(counts, sw_vb)
	bases = []
	idx = 0
	get_next_max = lambda window: np.argmax(rating[idx:idx+window-BASE_LEN])

	while idx < len(rating) - MAX_BASE_GAP_1:
		next_max = get_next_max(MAX_BASE_GAP_1)
		if rating[idx+next_max] < GOOD_BASE_THRESHOLD or next_max == MAX_BASE_GAP_1-BASE_LEN - 1 or next_max == 0:
			next_max = get_next_max(MAX_BASE_GAP_2)
		if rating[idx+next_max] < DECENT_BASE_THRESHOLD or next_max == MAX_BASE_GAP_2-BASE_LEN - 1 or next_max == 0:
			next_max = get_next_max(MAX_BASE_GAP)

		base = idx + next_max

		if base >= len(counts) - WINDOW_LEN: break
		idx = base + BASE_LEN 
		bases.append(base)
		
	return np.array(bases)

def compute_variations(counts: np.ndarray, bases: np.ndarray):
	result = np.empty_like(counts)

	cur = 0
	for i, base in enumerate(bases):
		base_value = np.nanmean(counts[base:base+BASE_LEN], axis=0)
		part_end = bases[i + 1] if i + 1 < len(bases) else len(result)
		
		result[cur:part_end] = counts[cur:part_end] / base_value * 100 - 100
		cur = part_end

	return result

def consolidate(data: np.ndarray, counts: np.ndarray, bases: np.ndarray):
	if len(bases) < 2:
		return data
	result = np.empty_like(data)

	cur = bases[1]
	result[:bases[1]] = data[:bases[1]]
	first_base_value = np.nanmean(counts[bases[0]:bases[0]+BASE_LEN], axis=0)

	for i, base in enumerate(bases):
		base_value = np.nanmean(counts[base:base+BASE_LEN], axis=0)
		if i == 0: continue

		part_end = bases[i + 1] if i + 1 < len(bases) else len(result)

		ratio = np.nanmean(base_value / first_base_value)
		result[cur:part_end] = data[cur:part_end] + (ratio - 1) * 100 
		cur = part_end

	return result