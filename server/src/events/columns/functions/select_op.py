
from events.columns.functions.common import TYPE, DTYPE, Value, ArgDef, Function, sql_to_value_dtype
from events.columns.context import ComputationContext

import numpy as np

from events.table_structure import E_FEID, get_col_by_name
	
class GetColumn(Function):
	def __init__(self) -> None:
		super().__init__('col', [
			ArgDef('column_name', [TYPE.LITERAL], [DTYPE.TEXT]),
			ArgDef('events_shift', [TYPE.LITERAL], [DTYPE.INT], default='0'),
		])

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

functions = {
	'col': GetColumn()
}