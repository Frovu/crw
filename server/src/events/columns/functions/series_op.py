from events.columns.functions.common import TYPE, DTYPE, Value, ArgDef, Function
from events.columns.context import ComputationContext
from cream import gsm
import numpy as np
import warnings

HOUR = 3600

def get_slices(t_time: np.ndarray, t_1: np.ndarray, t_2: np.ndarray):
	if len(t_time) < 1:
		return []
	t_l = np.minimum(t_1, t_2)
	t_r = np.maximum(t_1, t_2)
	left = (t_l - t_time[0]) // HOUR
	slice_len = (t_r - t_l) // HOUR + 1 # end inclusive
	left[np.isnan(left)] = -1
	slice_len[left < 0] = 1
	slice_len[np.isnan(slice_len)] = 1
	return [np.s_[int(l):int(l+sl)] for l, sl in zip(left, slice_len)]

class SeriesOperation(Function):
	def __init__(self, name: str, subtract_trend=False, normalize_variation=False) -> None:
		super().__init__(name, [
			ArgDef('series', [TYPE.SERIES], [DTYPE.REAL]),
			ArgDef('from', [TYPE.COLUMN], [DTYPE.TIME], default='@start'),
			ArgDef('to', [TYPE.COLUMN], [DTYPE.TIME], default='@end')
		])
		self.subtract_trend = subtract_trend
		self.normalize_variation = normalize_variation

	def __call__(self, args: tuple[Value, ...], ctx: ComputationContext) -> Value:
		super().validate(args)

		data = args[0]
		if len(args) == 3:
			slice_start = args[1].value
			slice_end = args[2].value
		else:
			slice_start, dur = ctx.select_columns_by_name(['time', 'duration'])
			slice_end = slice_start + dur * HOUR

		d_time, d_value = data.value[:,0], data.value[:,1]
		slices = get_slices(d_time, slice_start, slice_end)

		if self.name == 'coverage':
			result = np.array([np.count_nonzero(~np.isnan(d_value[sl])) / ((sl.stop - sl.start) or 1) * 100 for sl in slices])
			return Value(TYPE.COLUMN, DTYPE.REAL, result)

		with warnings.catch_warnings():
			warnings.simplefilter("ignore", category=RuntimeWarning)

			func = {
				'tmax': np.nanargmax,
				'tmin': np.nanargmin,
				'max': np.nanmax,
				'min': np.nanmin,
				'mean': np.nanmean,
				'median': np.nanmedian
			}[self.name]

			if self.normalize_variation or self.subtract_trend:
				prepare = lambda d: gsm.normalize_variation(d, with_trend=self.subtract_trend)
			else:
				prepare = None

			if prepare:
				result = np.array([func(prepare(d_value[sl])) for sl in slices])
			else:
				result = np.array([func(d_value[sl]) for sl in slices])

		if self.name in ['tmax', 'tmin']:
			t_idx = result + np.array([sl.start for sl in slices]) 
			t_result = d_time[t_idx]
			return Value(TYPE.COLUMN, DTYPE.TIME, t_result)

		return Value(TYPE.COLUMN, DTYPE.REAL, result)

functions = {
	'coverage': SeriesOperation('coverage')
}
for name_op in ['tmin', 'tmax', 'min', 'max', 'mean', 'median']:
	for functor in ['', 'v', 'vt']:
		functions[name_op+functor] = SeriesOperation(name_op, normalize_variation='v' in functor, subtract_trend='t' in functor)