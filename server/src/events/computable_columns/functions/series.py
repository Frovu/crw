
from events.computable_columns.functions.common import TYPE, DTYPE, Value, ArgDef, Function

class SeriesOperation(Function):
	def __init__(self, name: str) -> None:
		super().__init__(name, [
			ArgDef('series', [TYPE.SERIES], [DTYPE.NUMBER, DTYPE.TIME]),
			ArgDef('from', [TYPE.COLUMN], [DTYPE.TIME], default='@start'),
			ArgDef('to', [TYPE.COLUMN], [DTYPE.TIME], default='@end')
		])

	def validate(self, args: tuple[Value, ...]) -> None:
		super().validate(args)

	def evaluate(self, args: tuple[Value, ...]) -> Value:

		return Value(TYPE.LITERAL, DTYPE.NUMBER, 0)