import numpy as np

from events.columns.series import find_series
from events.columns.context import ComputationContext

from crow.rsm.core import fetch_counts, RSMPlotResponse
from crow.rsm.variations import compute_variations, compute_sw_vb, place_bases
from crow.rsm.models import fit_model, plot_model_result

def fetch_circles(t_from: int, t_to: int, include_models=False):
	counts, stations = fetch_counts(t_from, t_to)
	time, counts = counts[:,0].astype(int), counts[:,1:]

	ctx = ComputationContext(None, (t_from, t_to))
	v = ctx.select_series(find_series('V'))
	b = ctx.select_series(find_series('B'))
	sw_vb = compute_sw_vb(v, b)

	bases = place_bases(counts, sw_vb)
	variations = compute_variations(counts, bases)

	if include_models:
		popts = fit_model(time, variations, bases, stations)
		curves = [plot_model_result(popt) for popt in popts]
		model = [cur if cur is None else cur.tolist() for cur in curves]
	else:
		model = None

	variations = np.where(~np.isfinite(variations.T), None, np.round(variations.T, 2)).tolist() # type: ignore
	return RSMPlotResponse(time.tolist(), variations, stations, bases.tolist(), model).as_dict() # type: ignore
