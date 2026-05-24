import numpy as np

from events.columns.functions.common import TYPE, DTYPE, ArgDef, Value, ValueArray, Function
from events.columns.context import ComputationContext
from events.columns.series import find_series

from crow.rsm.core import fetch_counts
from crow.rsm.variations import place_bases, compute_base_rating, compute_sw_vb, compute_variations, consolidate, BASE_LEN
from crow.rsm.models import fit_model, MODELS

RSM_PARAMS = ['a0', 'a1', 'p1', 'a2', 'p2', 'mean', 'base', 'basert']

class RSMFunc(Function):
	def __init__(self):
		super().__init__('rsm', [
			ArgDef('parameter', [TYPE.LITERAL], [DTYPE.TEXT]),
			ArgDef('window', [TYPE.LITERAL], [DTYPE.INT], default='3'),
		], 'Ring of Stations method results. Params available: ' + ', '.join(RSM_PARAMS))

	def __call__(self, args: tuple[Value, ...], ctx: ComputationContext) -> Value:
		super().validate(args) # type: ignore

		param = str(args[0].value).lower()
		window: int = int(args[1].value) if len(args) > 1 else 3 # type: ignore

		if param not in RSM_PARAMS:
			raise ValueError(f'Unsupported RSM param: {args[0].value} options: '+ ', '.join(RSM_PARAMS)) # type: ignore

		data, stations = fetch_counts(*ctx.series_frame)
		counts = data[:,1:]
		v = ctx.select_series(find_series('V'))
		b = ctx.select_series(find_series('B'))
		vb = compute_sw_vb(v, b)
		
		if param == 'base':
			bases = place_bases(counts, vb)
			result = np.full_like(v, 0)
			for base in bases:
				result[base:base+BASE_LEN] = 1
		elif param == 'basert':
			result = compute_base_rating(counts, vb)
		else:

			bases = place_bases(counts, vb)
			variations = compute_variations(counts, bases[:1]) # FIXME: multibase

			if param == 'mean':
				result = np.nanmean(variations, axis=1)
			else:
				model = MODELS['harmonic']
				fit = fit_model(data[:,0], variations, bases, stations, window=window, model=model)
				result = fit[:,RSM_PARAMS.index(param)]

			# result = consolidate(result, counts, bases

		return Value(TYPE.SERIES, DTYPE.REAL, result)

		
functions = {
	'rsm': RSMFunc()
}