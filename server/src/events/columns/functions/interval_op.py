from events.columns.functions.common import TYPE, DTYPE, Value, ArgDef, Function
from events.columns.functions.series_op import get_slices
from events.columns.context import ComputationContext
import numpy as np

HOUR = 3600

class IntervalOperation(Function):
	def __init__(self, name: str, desc: str) -> None:
		super().__init__(name, [
			ArgDef('condition', [TYPE.SERIES], [DTYPE.BOOL]),
			ArgDef('from', [TYPE.COLUMN], [DTYPE.TIME], default='@start'),
			ArgDef('to', [TYPE.COLUMN], [DTYPE.TIME], default='@end')
		], desc)

	def __call__(self, args: tuple[Value, ...], ctx: ComputationContext) -> Value:
		super().validate(args)

		data = args[0]
		if len(args) == 3:
			slice_start = args[1].value
			slice_end = args[2].value
		else:
			slice_start, dur = ctx.select_columns_by_name(['time', 'duration'])
			slice_end = slice_start + dur * HOUR

		d_time, d_value = (data.value[:,0], data.value[:,1]) if len(data.value) > 0 else (np.array([]), np.array([]))
		slices = get_slices(d_time, slice_start, slice_end)

		if self.name == 'ilen':
			res = np.array([np.count_nonzero(d_value[sl]) for sl in slices])
			
		else:
			res = np.full(len(slices), np.nan)

			if self.name == 'icount':
				for i, slice in enumerate(slices):
					preceding = np.roll(d_value[slice], 1)
					preceding[0] = False
					res[i] = np.count_nonzero(d_value[slice] & ~preceding)
			
			elif self.name == 'itime':
				for i, slice in enumerate(slices):
					if np.count_nonzero(d_value[slice]) == 0:
						res[i] = np.nan
					else:
						res[i] = (d_time[np.argmax(d_value[slice]) + slice.start] - slice_start[i]) / HOUR

		dtype = DTYPE.TIME if self.name == 'time' else DTYPE.INT
		return Value(TYPE.COLUMN, dtype, res)

functions = {
	'icount': IntervalOperation('icount', 'count of periods where condition is true for 1+ hours consecutively, within given interval'),
	'itime': IntervalOperation('itime', 'get time of the first hour where the condition is true, within given interval'),
	'ilen': IntervalOperation('ilen', 'total count of the hours where condition is true within given interval'),
}