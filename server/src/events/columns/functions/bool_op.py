
from operator import lt, le, eq, ne, gt, ge
from events.columns.functions.common import TYPE, DTYPE, Value, ArgDef, Function
import numpy as np

class BoolOperation(Function):
	def __init__(self, name: str, fn, op: str) -> None:
		types = [t for t in TYPE]
		dtypes = [DTYPE.REAL, DTYPE.INT, DTYPE.TIME]
		desc = f'equivalent to a {op} b'
		super().__init__(name, [ArgDef('a', types, dtypes), ArgDef('b', types, dtypes)], desc)
		self.fn = fn
		self.op = op

	def __call__(self, args: tuple[Value, ...], _) -> Value:
		super().validate(args)
		for one, other in [args, args[::-1]]:
			if one.type == TYPE.SERIES and other.type not in [TYPE.SERIES, TYPE.LITERAL]:
				raise TypeError(f'{self.op} not supported between {one.type} and {other.type}')
			if one.type == TYPE.COLUMN and other.type not in [TYPE.COLUMN, TYPE.LITERAL]:
				raise TypeError(f'{self.op} not supported between {one.type} and {other.type}')
			if one.dtype == DTYPE.TIME and other.dtype != DTYPE.TIME:
				raise TypeError(f'{self.op} not supported between {one.dtype} and {other.dtype}')
			
		is_series = any(a.type == TYPE.SERIES for a in args)
		is_column = any(a.type == TYPE.COLUMN for a in args)

		lhv, rhv = [a.value for a in args]

		if is_series:
			res_value = np.column_stack((lhv[:,0], self.fn(lhv[:,1], rhv[:,1])))
		else:
			res_value = self.fn(lhv, rhv)

		res_type = TYPE.SERIES if is_series else TYPE.COLUMN if is_column else TYPE.LITERAL

		return Value(res_type, DTYPE.BOOL, res_value)

functions = {
	'lt': BoolOperation('lt', lt, '<'),
	'le': BoolOperation('le', le, '<='),
	'eq': BoolOperation('eq', eq, '=='),
	'ne': BoolOperation('ne', ne, '!='),
	'ge': BoolOperation('ge', ge, '>='),
	'gt': BoolOperation('gt', gt, '>'),
}