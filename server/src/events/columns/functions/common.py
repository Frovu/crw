from dataclasses import dataclass
from enum import StrEnum
from typing import Any

TYPE = StrEnum('TYPE', ['LITERAL', 'SERIES', 'COLUMN'])
DTYPE = StrEnum('DTYPE', ['NUMBER', 'TIME', 'STRING'])

@dataclass
class Value:
	type: TYPE
	dtype: DTYPE
	value: Any

def str_literal(val: str):
	return Value(TYPE.LITERAL, DTYPE.STRING, val)

def num_literal(val: float):
	return Value(TYPE.LITERAL, DTYPE.NUMBER, val)


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
			