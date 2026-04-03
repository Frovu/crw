
from operator import abs, add, sub, mul, pow, mod, truediv as div, floordiv
from numpy import sin, asin, cos, acos, tan, atan, atan2
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
	
class Atan2(Function):
	def __init__(self) -> None:
		super().__init__('atan2', [
			ArgDef('y', [t for t in TYPE], [DTYPE.REAL, DTYPE.INT]),
			ArgDef('x', [t for t in TYPE], [DTYPE.REAL, DTYPE.INT]),
		], 'atan(y/x), accounting for the quadrant (result range: [-π, π])')
	
	def __call__(self, args: tuple[Value, ...], _) -> Value:
		super().validate(args)
		res_value = atan2(args[0].value, args[1].value)
		return Value(args[0].type, DTYPE.REAL, res_value)

class MathOperation(Function):
	def __init__(self, name: str, fn, desc: str) -> None:
		types = [t for t in TYPE]
		dtypes = [DTYPE.REAL, DTYPE.INT, DTYPE.BOOL, DTYPE.TIME]
		super().__init__(name, [ArgDef('a', types, dtypes), ArgDef('b', types, dtypes)], desc)
		self.fn = fn

	def __call__(self, args: tuple[Value, ...], _) -> Value:
		super().validate(args)
		for one, other in [args, args[::-1]]:
			if one.type == TYPE.SERIES and other.type not in [TYPE.SERIES, TYPE.LITERAL] and len(other.value) > 1: # type: ignore
				raise TypeError(f'{self.name}() not supported between {one.type} and {other.type}')
			if one.type == TYPE.COLUMN and other.type not in [TYPE.COLUMN, TYPE.LITERAL] and len(one.value) > 1: # type: ignore
				raise TypeError(f'{self.name}() not supported between {one.type} and {other.type}')
			
		is_time = any(a.dtype == DTYPE.TIME for a in args)
		is_series = any(a.type == TYPE.SERIES for a in args)
		is_column = any(a.type == TYPE.COLUMN for a in args)

		if is_time and self.name not in ['add', 'sub']:
			raise TypeError(f'{self.name}() not supported with time values')

		lhv, rhv = [a.value * (3600 if is_time and a.dtype in [DTYPE.REAL, DTYPE.INT] else 1) for a in args]

		res_value = self.fn(lhv, rhv)

		res_type = TYPE.SERIES if is_series else TYPE.COLUMN if is_column else TYPE.LITERAL

		if is_time:
			res_dtype = DTYPE.TIME
			if self.name in ['sub'] and args[0].dtype == args[1].dtype: # TIME - TIME = INT (hours)
				res_value //= 3600
				res_dtype = DTYPE.INT
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
	'abs': UnaryOperation('abs', abs, 'the absolute value of a number: |a|'),
	**{ op: UnaryOperation(op, fn, '') for op, fn in [['sin', sin], ['asin', asin], ['cos', cos], ['acos', acos], ['tan', tan], ['atan', atan], ['atan2', atan2]] },
	'atan2': Atan2()
}