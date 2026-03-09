
from operator import abs, add, sub, mul, pow, mod, truediv as div, floordiv
from events.columns.functions.common import TYPE, DTYPE, Value, ArgDef, Function

class UnaryOperation(Function):
	def __init__(self, name: str, fn, desc: str) -> None:
		types = [t for t in TYPE]
		dtypes = [DTYPE.REAL, DTYPE.INT]
		super().__init__(name, [ArgDef('value', types, dtypes)], desc)
		self.fn = fn

	def __call__(self, args: tuple[Value, ...], _) -> Value:
		super().validate(args)
		arg = args[0]

		res_value = self.fn(arg.value)

		return Value(arg.type, arg.dtype, res_value)

class MathOperation(Function):
	def __init__(self, name: str, fn, desc: str) -> None:
		types = [t for t in TYPE]
		dtypes = [DTYPE.REAL, DTYPE.INT, DTYPE.TIME]
		super().__init__(name, [ArgDef('a', types, dtypes), ArgDef('b', types, dtypes)], desc)
		self.fn = fn

	def __call__(self, args: tuple[Value, ...], _) -> Value:
		super().validate(args)
		for one, other in [args, args[::-1]]:
			if one.type == TYPE.SERIES and other.type not in [TYPE.SERIES, TYPE.LITERAL]:
				raise TypeError(f'{self.name}() unsupported between {one.type} and {other.type}')
			if one.type == TYPE.COLUMN and other.type not in [TYPE.COLUMN, TYPE.LITERAL]:
				raise TypeError(f'{self.name}() unsupported between {one.type} and {other.type}')
			
		is_time = any(a.dtype == DTYPE.TIME for a in args)
		is_series = any(a.type == TYPE.SERIES for a in args)
		is_column = any(a.type == TYPE.COLUMN for a in args)

		if is_time and self.name not in ['add', 'sub']:
			raise TypeError(f'{self.name}() unsupported with time values')

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
	'add': MathOperation('add', add, 'the sum of two numbers: a + b'),
	'sub': MathOperation('sub', sub, 'the difference of two numbers: a - b'),
	'mul': MathOperation('mul', mul, 'the product: a * b'),
	'div': MathOperation('div', div, 'the result of folating point division: a / b'),
	'idiv': MathOperation('idiv', floordiv, 'the quotient of integer division: a // b'),
	'mod': MathOperation('mod', mod, 'the remainder of integer division: a %% b'),
	'pow': MathOperation('pow', pow, 'the exponentiation result: a ** b'),
	'abs': UnaryOperation('abs', abs, 'the absolute value of a number: |a|')
}