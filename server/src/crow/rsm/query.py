import numpy as np

from events.columns.series import find_series

from crow.rsm.core import fetch_counts, RSMPlotResponse
from crow.rsm.variations import compute_variations, compute_sw_vb, place_bases

def fetch_circles(t_from: int, t_to: int):
	counts, stations = fetch_counts(t_from, t_to)
	time, counts = counts[:,0].astype(int), counts[:,1:]

	v = find_series('V').fetch((t_from, t_to))[:,1]
	b = find_series('B').fetch((t_from, t_to))[:,1]
	sw_vb = compute_sw_vb(v, b)

	bases = place_bases(counts, sw_vb)
	variations = compute_variations(counts, bases)
	variations = np.where(~np.isfinite(variations.T), None, np.round(variations.T, 2)).tolist() # type: ignore
	return RSMPlotResponse(time.tolist(), variations, stations, bases.tolist()).as_dict()