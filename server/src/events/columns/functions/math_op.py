
from operator import add, sub, mul, truediv as div
from events.columns.functions.common import TYPE, DTYPE, Value, ArgDef, Function

class MathOperation(Function):
	def __init__(self, name: str, fn) -> None:
		types = [t for t in TYPE]
		dtypes = [DTYPE.REAL, DTYPE.INT, DTYPE.TIME]
		super().__init__(name, [ArgDef('lhs', types, dtypes), ArgDef('rhs', types, dtypes)])
		self.fn = fn

	def __call__(self, args: tuple[Value, ...]) -> Value:
		super().validate(args)
		for one, other in [args, args[::-1]]:
			if one.type == TYPE.SERIES and other.type not in [TYPE.SERIES, TYPE.LITERAL]:
				raise TypeError(f'{self.name}() unsupported between {one.type} and {other.type}')
			if one.type == TYPE.COLUMN and other.type not in [TYPE.COLUMN, TYPE.LITERAL]:
				raise TypeError(f'{self.name}() unsupported between {one.type} and {other.type}')
			
		is_time = any(a.dtype == DTYPE.TIME for a in args)
		is_series = any(a.type == TYPE.SERIES for a in args)
		is_column = any(a.type == TYPE.COLUMN for a in args)

		if is_time:
			lhv, rhv = [a.value * 3600 if a.dtype in [DTYPE.REAL, DTYPE.INT] else a.value for a in args]
		else:
			lhv, rhv = [a.value for a in args]

		res_value = self.fn(lhv, rhv)
		res_type = TYPE.SERIES if is_series else TYPE.COLUMN if is_column else TYPE.LITERAL

		if is_time:
			res_dtype = DTYPE.TIME
		else:
			res_dtype = DTYPE.INT if self.name != 'div' and all(a.dtype == DTYPE.INT for a in args) else DTYPE.REAL

		return Value(res_type, res_dtype, res_value)
	
functions = {
	'add': MathOperation('add', add),
	'sub': MathOperation('sub', sub),
	'mul': MathOperation('mul', mul),
	'div': MathOperation('div', div),
}