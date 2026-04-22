import numpy as np

from events.columns.functions.common import TYPE, DTYPE, ArgDef, Value, ValueArray, Function
from events.columns.context import ComputationContext

from crow.rsm.historical import fetch_variations_data, fetch_base_rating
from events.columns.series import find_series

RSM_PARAMS = ['a0', 'base', 'basert']

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

		starts = ctx.select_columns_by_name(['time'])[0]
		

		# for t, r in zip(time, vars):
		# 	from datetime import datetime
		# 	print(datetime.utcfromtimestamp(t), *np.round(r, 2))
		if param == 'a0':
			time, vars, sta = fetch_variations_data(*ctx.series_frame, starts.astype(int).tolist()[:1])
			result = np.nanmean(vars, axis=1)
		else:
			v = ctx.select_series(find_series('V'))
			b = ctx.select_series(find_series('B'))
			vb = v / 400 * b / 5
			result = fetch_base_rating(*ctx.series_frame, vb, param == 'basert')

		return Value(TYPE.SERIES, DTYPE.REAL, result)

		
functions = {
	'rsm': RSMFunc()
}