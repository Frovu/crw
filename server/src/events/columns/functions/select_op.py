
import numpy as np

from events.columns.functions.common import TYPE, DTYPE, Value, ArgDef, Function, sql_to_value_dtype
from events.columns.context import ComputationContext, SRC_COL_ORDERING_OPTIONS, SRC_COL_ENTITY_OPTIONS
from events.columns.series import find_series
from events.table_structure import ALL_TABLES, E_FEID, INFLUENCE_ENUM, get_col_by_name

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

class GetColumn(Function):
	def __init__(self) -> None:
		super().__init__('col', [
			ArgDef('column_name', [TYPE.LITERAL], [DTYPE.TEXT]),
			ArgDef('events_shift', [TYPE.LITERAL], [DTYPE.INT], default='0'),
		], 'get the values of a static FEID column, shift parameter allows to take values from next/previous event for filtering purposes')

	def __call__(self, args: tuple[Value, ...], ctx: ComputationContext) -> Value:
		super().validate(args)
		col_name = args[0].value
		shift = int(args[1].value) if len(args) > 1 else 0

		column = get_col_by_name(E_FEID, col_name)
		dtype = sql_to_value_dtype(column.dtype)

		data = ctx.select_columns([column])[0]

		if shift == 0:
			res = data
		else:
			res = np.full_like(data, None if dtype == DTYPE.TEXT else np.nan)
			if shift > 0:
				res[:-shift] = data[shift:]
			else:
				res[-shift:] = data[:shift]

		return Value(TYPE.COLUMN, dtype, res)
	
def parse_infl(text: str) -> list[str]:
	infl_list = [next((infl for infl in INFLUENCE_ENUM if infl.startswith(lt.strip())), None) for lt in text.split(',')]
	if None in infl_list or len(infl_list) < 1:
		raise ValueError('Invalid influence list. Examples: "p,s", "p,s,r"')
	return infl_list # type: ignore

class GetSourceColumn(Function):
	def __init__(self) -> None:
		super().__init__('scol', [
			ArgDef('entity_name', [TYPE.LITERAL], [DTYPE.TEXT]),
			ArgDef('column_name', [TYPE.LITERAL], [DTYPE.TEXT]),
			ArgDef('order_by', [TYPE.LITERAL], [DTYPE.TEXT], default='time'),
			ArgDef('influence_list', [TYPE.LITERAL], [DTYPE.TEXT], default='p,s'),
		], 'get values for solar events related to the FEID')

	def __call__(self, args: tuple[Value, ...], ctx: ComputationContext) -> Value:
		super().validate(args)
		
		assert len(args) > 1
		entity = args[0].value
		column = args[1].value
		order = str(args[2].value) if len(args) > 2 else 'time'
		infl = str(args[3].value) if len(args) > 3 else 'p,s'

		if order not in SRC_COL_ORDERING_OPTIONS:
			raise ValueError(f'Bad ordering keyword: "{order}". The options are: ' + ', '.join(SRC_COL_ORDERING_OPTIONS))
		if entity not in SRC_COL_ENTITY_OPTIONS:
			raise ValueError(f'Unknown entity: "{entity}". The options are: ' + ', '.join(SRC_COL_ENTITY_OPTIONS))
		column = next((col for col in ALL_TABLES[entity] if col.sql_name == column), None)
		if not column:
			col_opts = ', '.join([col.sql_name for col in ALL_TABLES[entity]])
			raise ValueError(f'Unknown column: "{column}". The options are: ' + col_opts)
		
		data = ctx.select_source_column(entity, column, order, parse_infl(infl))

		dtype = sql_to_value_dtype(column.dtype)

		return Value(TYPE.COLUMN, dtype, data)

functions = {
	'col': GetColumn(),
	'ser': GetSeries(),
	'scol': GetSourceColumn(),
}