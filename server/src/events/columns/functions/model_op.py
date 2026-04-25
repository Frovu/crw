import numpy as np

from events.columns.functions.common import TYPE, DTYPE, ArgDef, Value, ValueArray, Function
from events.columns.context import ComputationContext
from events.columns.series import find_series

from crow.rsm.core import fetch_counts
from crow.rsm.variations import place_bases, compute_base_rating, compute_sw_vb, compute_variations, consolidate, BASE_LEN

RSM_PARAMS = ['a0', 'a0sb', 'base', 'basert']

class RSMFunc(Function):
	def __init__(self):
		super().__init__('rsm', [
			ArgDef('parameter', [TYPE.LITERAL], [DTYPE.TEXT]),
		], 'Ring of Stations method results. Params available: ' + ', '.join(RSM_PARAMS))

	def __call__(self, args: tuple[Value[ValueArray], ...], ctx: ComputationContext) -> Value:
		super().validate(args) # type: ignore

		param = str(args[0].value).lower()

		if param not in RSM_PARAMS:
			raise ValueError(f'Unsupported RSM param: {args[0].value} options: '+ ', '.join(RSM_PARAMS))

		data, _ = fetch_counts(*ctx.series_frame)
		counts = data[:,1:]
		v = ctx.select_series(find_series('V'))
		b = ctx.select_series(find_series('B'))
		vb = compute_sw_vb(v, b)
		
		if param in ['a0', 'a0sb']:
			bases = place_bases(counts, vb)
			if param == 'a0sb':
				variations = compute_variations(counts, bases[:1])
			else:
				variations = compute_variations(counts, bases)
			result = np.nanmean(variations, axis=1)
			if param != 'a0sb':
				result = consolidate(result, counts, bases)
		elif param == 'base':
			bases = place_bases(counts, vb)
			result = np.full_like(v, 0)
			for base in bases:
				result[base:base+BASE_LEN] = 1
		else: # param == 'basert':
			result = compute_base_rating(counts, vb)

		return Value(TYPE.SERIES, DTYPE.REAL, result)

		
functions = {
	'rsm': RSMFunc()
}