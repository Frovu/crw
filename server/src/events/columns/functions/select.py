
from events.columns.functions.common import TYPE, DTYPE, Value, ArgDef, Function
from events.columns.context import ComputationContext

import numpy as np

from events.table_structure import E_FEID, get_col_by_name
	
class GetColumn(Function):
	def __init__(self) -> None:
		super().__init__('col', [
			ArgDef('column_name', [TYPE.LITERAL], [DTYPE.STRING]),
			ArgDef('events_shift', [TYPE.LITERAL], [DTYPE.NUMBER], default='0'),
		])

	def evaluate(self, args: tuple[Value, ...], ctx: ComputationContext) -> Value:
		super().validate(args)
		col_name = args[0].value
		shift = args[1].value if len(args) > 1 else 0

		column = get_col_by_name(E_FEID, col_name)
		dtype = DTYPE.TIME if column.dtype == 'time' else DTYPE.NUMBER if column.dtype in ['real', 'integer'] else DTYPE.STRING

		data = ctx.select_columns([column])[0]

		if shift == 0:
			res = data
		else:
			res = np.full_like(data, '' if dtype == DTYPE.STRING else np.nan)
			if shift > 0:
				res[:-shift] = res[shift:]
			else:
				res[-shift:] = res[:shift]

		return Value(TYPE.COLUMN, dtype, res)

functions = {
	'col': GetColumn()
}