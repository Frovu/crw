from events.columns.functions.common import TYPE, DTYPE, Value, ValueArray, ArgDef, Function
from events.columns.context import ComputationContext
from cream import gsm
import numpy as np
import warnings

HOUR = 3600

class SeriesOperation(Function):
	def __init__(self, name: str, desc: str, subtract_trend=False, normalize_variation=False) -> None:
		super().__init__(name, [
			ArgDef('series', [TYPE.SERIES], [DTYPE.REAL]),
			ArgDef('from', [TYPE.COLUMN], [DTYPE.TIME], default='@start'),
			ArgDef('to', [TYPE.COLUMN], [DTYPE.TIME], default='@end')
		], desc)
		self.subtract_trend = subtract_trend
		self.normalize_variation = normalize_variation

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

			if self.normalize_variation or self.subtract_trend:
				prepare = lambda d: gsm.normalize_variation(d, with_trend=self.subtract_trend)
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
	def __init__(self) -> None:
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
	def __init__(self) -> None:
		super().__init__('val', [
			ArgDef('series', [TYPE.SERIES], [DTYPE.REAL]),
			ArgDef('time', [TYPE.COLUMN], [DTYPE.TIME]),
		], 'series value at given hour')

	def __call__(self, args: tuple[Value[ValueArray], Value[ValueArray]], ctx: ComputationContext) -> Value:
		super().validate(args) # type: ignore

		value = args[0].value 
		t_time = args[1].value
		
		res_idx = (t_time - ctx.series_frame[0]) // HOUR
		result = value[res_idx.astype(int)]

		return Value(TYPE.COLUMN, args[0].dtype, result)

functions = {
	'val': ValueOp(),
	'der': Derivative(),
	'coverage': SeriesOperation('coverage', 'percentage of the inteval, where given value is not null')
}
descs = {
	'tmax': 'absolute time of the supremum for a series in the [from, to) interval',
	'tmin': 'absolute time of the infinum for a series in the [from, to) interval',
	'max': 'maximum value of a given series in the [from, to) interval',
	'min': 'minimum value of a given series in the [from, to) interval',
	'mean': 'the mean value of a given series in the [from, to) interval',
	'median': 'the median value of a given series in the [from, to) interval'
}
for name_op in descs.keys():
	for functor in ['', 'v', 'vt']:
		desc = descs[name_op]
		if 'v' in functor:
			desc += '. treated as variation, normalized to max value'
		if 'vt' in functor:
			desc += '. corrected for positive linear trend'
		functions[name_op+functor] = SeriesOperation(name_op, desc, normalize_variation='v' in functor, subtract_trend='t' in functor)