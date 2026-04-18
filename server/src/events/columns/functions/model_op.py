import numpy as np

from events.columns.functions.common import TYPE, DTYPE, Value, ValueArray, Function
from events.columns.context import ComputationContext

from crow.rsm.historical import fetch_variations_data

class RSMFunc(Function):
	def __init__(self):
		super().__init__('rsm', [
		], 'Ring of Stations method results')

	def __call__(self, args: tuple[Value[ValueArray], ...], ctx: ComputationContext) -> Value:
		super().validate(args) # type: ignore

		starts = ctx.select_columns_by_name(['time'])[0]
		
		time, vars, sta = fetch_variations_data(*ctx.series_frame, starts.astype(int).tolist())

		# for t, r in zip(time, vars):
		# 	from datetime import datetime
		# 	print(datetime.utcfromtimestamp(t), *np.round(r, 2))

		result = np.nanmean(vars, axis=1)

		return Value(TYPE.SERIES, DTYPE.REAL, result)

		
functions = {
	'rsm': RSMFunc()
}