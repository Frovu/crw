
import numpy as np

from events.columns.functions.common import TYPE, DTYPE, Value, ArgDef, Function, sql_to_value_dtype
from events.columns.context import ComputationContext
from events.columns.series import find_series
from events.table_structure import E_FEID, get_col_by_name

class GetColumn(Function):
	def __init__(self) -> None:
		super().__init__('col', [
			ArgDef('column_name', [TYPE.LITERAL], [DTYPE.TEXT]),
			ArgDef('events_shift', [TYPE.LITERAL], [DTYPE.INT], default='0'),
		], 'the values of a static FEID column')

	def __call__(self, args: tuple[Value, ...], ctx: ComputationContext) -> Value:
		super().validate(args)
		col_name = args[0].value
		shift = args[1].value if len(args) > 1 else 0

		column = get_col_by_name(E_FEID, col_name)
		dtype = sql_to_value_dtype(column.dtype)

		data = ctx.select_columns([column])[0]

		if shift == 0:
			res = data
		else:
			res = np.full_like(data, '' if dtype == DTYPE.TEXT else np.nan)
			if shift > 0:
				res[:-shift] = res[shift:]
			else:
				res[-shift:] = res[:shift]

		return Value(TYPE.COLUMN, dtype, res)

class GetSeries(Function):
	def __init__(self) -> None:
		super().__init__('col', [
			ArgDef('series_name', [TYPE.LITERAL], [DTYPE.TEXT])
		], 'a data series, for the list of series check a special tab')

	def __call__(self, args: tuple[Value, ...], ctx: ComputationContext) -> Value:
		super().validate(args)
		
		series = find_series(args[0].value)
		data = ctx.select_series(series)
		dtype = DTYPE.TEXT if series.dtype == 'str' else DTYPE.REAL

		return Value(TYPE.SERIES, dtype, data)

functions = {
	'col': GetColumn(),
	'ser': GetSeries()
}