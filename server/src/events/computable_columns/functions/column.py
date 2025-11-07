
from events.computable_columns.functions.common import TYPE, DTYPE, Value, ArgDef, Function
	
class GetColumn(Function):
	def __init__(self) -> None:
		super().__init__('col', [
			ArgDef('column_name', [TYPE.LITERAL], [DTYPE.STRING]),
			ArgDef('events_shift', [TYPE.LITERAL], [DTYPE.NUMBER], default='0'),
		])

	def evaluate(self, args: tuple[Value, ...]) -> Value:
		super().validate(args)
		col_name = args[0].value
		shift = args[1].value if len(args) > 1 else 0
		return Value(TYPE.LITERAL, DTYPE.NUMBER, 0)

functions = {
	'col': GetColumn()
}