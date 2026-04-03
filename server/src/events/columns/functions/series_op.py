from events.columns.functions.common import TYPE, DTYPE, Value, ValueArray, ArgDef, Function
from events.columns.context import ComputationContext
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
import warnings

HOUR = 3600

def _subtract_trend(data: np.ndarray):
	xs = np.arange(data.shape[0])
	mask = np.isfinite(data)
	if np.count_nonzero(mask) > 1:
		trend = np.polyfit(xs[mask], data[mask], 1)
		if trend[0] > 0 and data[-1] > data[0]:
			ys = np.poly1d(trend)(xs)
			data = data - ys + ys[0]
	return data

class SeriesOperation(Function):
	def __init__(self, name: str, desc: str, subtract_trend=False) -> None:
		super().__init__(name, [
			ArgDef('series', [TYPE.SERIES], [DTYPE.REAL]),
			ArgDef('from', [TYPE.COLUMN], [DTYPE.TIME], default='@start'),
			ArgDef('to', [TYPE.COLUMN], [DTYPE.TIME], default='@end')
		], desc)
		self.subtract_trend = subtract_trend

	def __call__(self, args: tuple[Value[ValueArray], ...], ctx: ComputationContext) -> Value:
		super().validate(args) # type: ignore

		value = args[0].value
		if len(args) == 3:
			slice_start = args[1].value
			slice_end = args[2].value
		else:
			slice_start, dur = ctx.select_columns_by_name(['time', 'duration'])
			slice_end = slice_start + dur * HOUR

		slices = ctx.get_slices(slice_start, slice_end)

		if self.name == 'coverage':
			result = np.array([np.count_nonzero(~np.isnan(value[sl])) / ((sl.stop - sl.start) or 1) * 100 for sl in slices])
			return Value(TYPE.COLUMN, DTYPE.REAL, result)

		with warnings.catch_warnings():
			warnings.simplefilter("ignore", category=RuntimeWarning)

			func = {
				'tmax': lambda sl: -1 if np.isnan(sl).all() else np.nanargmax(sl),
				'tmin': lambda sl: -1 if np.isnan(sl).all() else np.nanargmin(sl),
				'max': lambda sl: np.nanmax(sl, initial=-np.inf),
				'min': lambda sl: np.nanmin(sl, initial=np.inf),
				'mean': np.nanmean,
				'median': np.nanmedian
			}[self.name]

			if self.subtract_trend:
				prepare = lambda d: _subtract_trend(d)
			else:
				prepare = None

			if prepare:
				result = np.array([func(prepare(value[sl])) for sl in slices])
			else:
				result = np.array([func(value[sl]) for sl in slices])

		if self.name in ['tmax', 'tmin']:
			t_idx = result + np.array([sl.start for sl in slices])
			t_result = np.where(result == -1, np.nan, ctx.series_frame[0] + t_idx * HOUR) 
			return Value(TYPE.COLUMN, DTYPE.TIME, t_result)

		return Value(TYPE.COLUMN, DTYPE.REAL, result)

class Derivative(Function):
	def __init__(self):
		super().__init__('der', [
			ArgDef('series', [TYPE.SERIES], [dt for dt in DTYPE]),
			ArgDef('order', [TYPE.LITERAL], [DTYPE.INT], default='1'),
		], 'n-th order "derivative" of the series (difference between cur and prev measurement interval)')

	def __call__(self, args: tuple[Value[ValueArray], ...], _: ComputationContext) -> Value:
		super().validate(args) # type: ignore

		value = args[0].value
		order = int(args[1].value) if len(args) > 1 else 1

		res = np.empty_like(value)
		res[:order] = np.nan

		temp = value
		for i in range(order):
			temp = temp[1:] - temp[:-1]

		res[order:] = temp

		return Value(TYPE.SERIES, DTYPE.REAL, res)

class ValueOp(Function):
	def __init__(self):
		super().__init__('val', [
			ArgDef('series', [TYPE.SERIES], [DTYPE.REAL]),
			ArgDef('time', [TYPE.COLUMN], [DTYPE.TIME], default='@start'),
		], 'series value at given hour')

	def __call__(self, args: tuple[Value[ValueArray], ...], ctx: ComputationContext) -> Value:
		super().validate(args) # type: ignore

		value = args[0].value 
		t_time = args[1].value if len(args) > 1 else ctx.select_columns_by_name(['time'])[0]

		if not ctx.series_frame:
			result = np.full_like(t_time, np.nan)
		else:
			res_idx = (t_time - ctx.series_frame[0]) // HOUR
			res_idx[res_idx < 0] = -1
			result = np.where(res_idx >= 0, value[res_idx.astype(int)], np.nan)

		return Value(TYPE.COLUMN, DTYPE.REAL, result)

class RebaseOp(Function):
	def __init__(self):
		super().__init__('rebase', [
			ArgDef('base_series', [TYPE.SERIES], [DTYPE.REAL]),
			ArgDef('base_time', [TYPE.COLUMN], [DTYPE.TIME], default='@start'),
		], 'variation rebase correction: = 1 / (1 + b / 100)')

	def __call__(self, args: tuple[Value[ValueArray], ...], ctx: ComputationContext) -> Value:
		super().validate(args) # type: ignore

		base_val: np.ndarray = ValueOp()((*args,), ctx).value # type: ignore
		res = 1 / (1 + base_val / 100)

		return Value(TYPE.COLUMN, DTYPE.REAL, res)
	
class ShiftOp(Function):
	def __init__(self):
		super().__init__('shift', [
			ArgDef('value', [TYPE.SERIES, TYPE.COLUMN], [dt for dt in DTYPE]),
			ArgDef('shift', [TYPE.LITERAL], [DTYPE.INT], default='1'),
		], 'shift an array: shift([1, 2, 3, 4], 2) = [nan, nan, 1, 2]')

	def __call__(self, args: tuple[Value[ValueArray], ...], ctx: ComputationContext) -> Value:
		super().validate(args) # type: ignore

		value = args[0].value
		shift = int(args[1].value) if len(args) > 1 else 1

		res = np.roll(value, shift)
		if shift >= 0:
			res[:shift] = np.nan
		else:
			res[shift:] = np.nan

		return Value(args[0].type, args[0].dtype, res) # type: ignore
	
class MovingAverage(Function):
	def __init__(self):
		super().__init__('movavg', [
			ArgDef('series', [TYPE.SERIES], [DTYPE.REAL, DTYPE.INT]),
			ArgDef('window_size', [TYPE.LITERAL], [DTYPE.INT], default='2'),
		], 'moving average of the series (windows are always trailing)')

	def __call__(self, args: tuple[Value[ValueArray], ...], ctx: ComputationContext) -> Value:
		super().validate(args) # type: ignore

		value = args[0].value
		window = int(args[1].value) if len(args) > 1 else 2

		res = np.empty_like(value)
		res[window-1:] = np.nanmean(sliding_window_view(value, window_shape=window), axis=1)
		res[:window] = np.nan

		return Value(TYPE.SERIES, DTYPE.REAL, res)
		
functions = {
	'val': ValueOp(),
	'der': Derivative(),
	'shift': ShiftOp(),
	'movavg': MovingAverage(),
	'rebase': RebaseOp(),
	'coverage': SeriesOperation('coverage', 'percentage of the inteval, where given value is not null'),
	'mean': SeriesOperation('mean', 'the mean value of a given series in the [from, to) interval'),
	'median': SeriesOperation('median', 'the median value of a given series in the [from, to) interval')
}
descs = {
	'tmax': 'absolute time of the supremum for a series in the [from, to) interval',
	'tmin': 'absolute time of the infinum for a series in the [from, to) interval',
	'max': 'maximum value of a given series in the [from, to) interval',
	'min': 'minimum value of a given series in the [from, to) interval',
}
for name_op in descs.keys():
	for functor in ['', 't']:
		desc = descs[name_op]
		if 't' in functor:
			desc += '. data is first corrected for positive linear trend (if present) in each interval'
		functions[name_op+functor] = SeriesOperation(name_op, desc, subtract_trend='t' in functor)