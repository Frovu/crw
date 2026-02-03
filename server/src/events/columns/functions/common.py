from dataclasses import dataclass
from enum import StrEnum
from typing import Any

TYPE = StrEnum('TYPE', ['LITERAL', 'SERIES', 'COLUMN'])
DTYPE = StrEnum('DTYPE', ['REAL', 'INT', 'TIME', 'TEXT'])

@dataclass
class Value:
	type: TYPE
	dtype: DTYPE
	value: Any

def str_literal(val: str):
	return Value(TYPE.LITERAL, DTYPE.TEXT, val)

def num_literal(val: float):
	dtype = DTYPE.INT if val % 1 == 0 else DTYPE.REAL
	return Value(TYPE.LITERAL, dtype, val)

def sql_to_value_dtype(dtype: str):
	if dtype == 'time':
		return DTYPE.TIME
	if dtype == 'integer':
		return DTYPE.INT
	if dtype == 'real':
		return DTYPE.REAL
	return DTYPE.TEXT

def value_to_sql_dtype(dtype: DTYPE):
	if dtype == DTYPE.TIME:
		return 'time'
	if dtype == DTYPE.INT:
		return 'integer'
	if dtype == DTYPE.REAL:
		return 'real'
	return 'text'

@dataclass
class ArgDef:
	name: str
	types: list[TYPE]
	dtypes: list[DTYPE]
	default: str | None = None # for documentation purposes, actual implementation in evaluate()

class Function:
	def __init__(self, name: str, args_def: list[ArgDef]) -> None:
		self.name = name
		self.args_def = args_def

	def validate(self, args: tuple[Value, ...]) -> None:
		if len(args) > len(self.args_def):
			raise TypeError(f'{self.name}() takes {len(self.args_def)} arguments, got {len(args)}')
		for i, arg_def in enumerate(self.args_def):
			if i >= len(args):
				if arg_def.default:
					break
				required_cnt = len([d for d in self.args_def if not d.default])
				raise TypeError(f'{self.name}() requires at least {required_cnt} arguments, got {len(args)}')
			arg = args[i]
			if arg.type not in arg_def.types:
				supported = ' or '.join(arg_def.types)
				raise TypeError(f'{self.name}().{arg_def.name} expected {supported}, got {arg.type}')
			if arg.dtype not in arg_def.dtypes:
				supported = ' or '.join(arg_def.dtypes)
				raise TypeError(f'{self.name}().{arg_def.name} expected type {supported}, got {arg.dtype}')
			