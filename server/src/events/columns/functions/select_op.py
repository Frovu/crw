
import numpy as np

from events.columns.functions.common import TYPE, DTYPE, Value, ArgDef, Function, sql_to_value_dtype
from events.columns.context import ComputationContext, SRC_COL_ORDERING_OPTIONS, SRC_COL_ENTITY_OPTIONS
from events.columns.series import find_series
from events.table_structure import ALL_TABLES, E_FEID, INFLUENCE_ENUM, E_SOURCE_CH, E_SOURCE_ERUPT, get_col_by_name

class GetSeries(Function):
	def __init__(self) -> None:
		super().__init__('col', [
			ArgDef('series_name', [TYPE.LITERAL], [DTYPE.TEXT])
		], 'a data series, for the list of series check a special tab')

	def __call__(self, args: tuple[Value, ...], ctx: ComputationContext) -> Value:
		super().validate(args)
		
		series = find_series(str(args[0].value))
		data = ctx.select_series(series)
		dtype = DTYPE.TEXT if series.dtype == 'str' else DTYPE.REAL

		return Value(TYPE.SERIES, dtype, data)

class GetColumn(Function):
	def __init__(self) -> None:
		super().__init__('col', [
			ArgDef('column_name', [TYPE.LITERAL], [DTYPE.TEXT])
		], 'get the values of a static FEID column, shift parameter allows to take values from next/previous event for filtering purposes')

	def __call__(self, args: tuple[Value, ...], ctx: ComputationContext) -> Value:
		super().validate(args)
		col_name = str(args[0].value)

		column = get_col_by_name(E_FEID, col_name)
		dtype = sql_to_value_dtype(column.dtype)

		data = ctx.select_columns([column])[0]

		return Value(TYPE.COLUMN, dtype, data)
	
def parse_infl(text: str) -> list[str]:
	infl_list = [next((infl for infl in INFLUENCE_ENUM if infl.startswith(lt.strip())), None) for lt in text.split(',')]
	if None in infl_list or len(infl_list) < 1:
		raise ValueError('Invalid influence list. Examples: "p,s", "p,s,r"')
	return infl_list # type: ignore

def parse_entity(entity: str) -> str:
	if entity not in SRC_COL_ENTITY_OPTIONS:
		raise ValueError(f'Unknown entity: "{entity}". The options are: ' + ', '.join(SRC_COL_ENTITY_OPTIONS))
	return E_SOURCE_CH if entity == 'ch' else E_SOURCE_ERUPT if entity == 'erupt' else entity

class GetSourceColumn(Function):
	def __init__(self) -> None:
		super().__init__('scol', [
			ArgDef('entity_name', [TYPE.LITERAL], [DTYPE.TEXT]),
			ArgDef('column_name', [TYPE.LITERAL], [DTYPE.TEXT]),
			ArgDef('influence_list', [TYPE.LITERAL], [DTYPE.TEXT], default='p,s'),
			ArgDef('order_by', [TYPE.LITERAL], [DTYPE.TEXT], default='time'),
		], 'get values for solar events related to the FEID')

	def __call__(self, args: tuple[Value, ...], ctx: ComputationContext) -> Value:
		super().validate(args)
		
		entity = parse_entity(str(args[0].value))
		col_name = str(args[1].value)
		infl = str(args[2].value) if len(args) > 2 else 'p,s'
		order = str(args[3].value) if len(args) > 3 else 'time'
		
		if order not in SRC_COL_ORDERING_OPTIONS:
			raise ValueError(f'Bad ordering keyword: "{order}". The options are: ' + ', '.join(SRC_COL_ORDERING_OPTIONS))
		column = next((col for col in ALL_TABLES[entity] if col.sql_name == col_name), None)
		if not column:
			col_opts = ', '.join([col.sql_name for col in ALL_TABLES[entity]])
			raise ValueError(f'Unknown column: "{col_name}". The options are: ' + col_opts)
		
		data = ctx.select_source_column(entity, parse_infl(infl), column, order)

		dtype = sql_to_value_dtype(column.dtype)

		return Value(TYPE.COLUMN, dtype, data)

class GetSourceCount(Function):
	def __init__(self) -> None:
		super().__init__('scol', [
			ArgDef('entity_name', [TYPE.LITERAL], [DTYPE.TEXT]),
			ArgDef('influence_list', [TYPE.LITERAL], [DTYPE.TEXT], default='p,s'),
		], 'get count of associated sources of given type and influence')

	def __call__(self, args: tuple[Value, ...], ctx: ComputationContext) -> Value:
		super().validate(args)
		
		entity = parse_entity(str(args[0].value))
		infl = str(args[1].value) if len(args) > 1 else 'p,s'
		
		data = ctx.select_source_column(entity, parse_infl(infl), get_count=True)

		return Value(TYPE.COLUMN, DTYPE.INT, data)

functions = {
	'col': GetColumn(),
	'ser': GetSeries(),
	'scol': GetSourceColumn(),
	'scnt': GetSourceCount(),
}