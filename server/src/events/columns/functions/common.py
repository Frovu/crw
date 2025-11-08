from dataclasses import dataclass
from enum import StrEnum
from typing import Union
import numpy as np

from events.columns.column import Column

TYPE = StrEnum('TYPE', ['LITERAL', 'SERIES', 'COLUMN'])
DTYPE = StrEnum('DTYPE', ['NUMBER', 'TIME', 'STRING'])
VTYPE = Union[str, float, np.ndarray]

# margin in hours before first and after last event where series data will be available for computation
# since it should ideally be the same for all series, it cannot be determined dynamically
SERIES_FRAME_MARGIN = 320

@dataclass
class Value:
	type: TYPE
	dtype: DTYPE
	value: VTYPE

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
			
class Computation:
	def __init__(self, target_ids: list[int] | None = None) -> None:
		self.target_ids = target_ids
		self.cache = {}

	def select_columns(self, columns: list[ColumnDef]):

		relp = '' if rel == 'FE' else (rel.lower() + '_')
		columns = ','.join([f'EXTRACT(EPOCH FROM {relp}{c})::integer'
			if 'time' in c else (relp + c) for c in query])
		select_query = f'SELECT {columns}\nFROM {SELECT_FEID} '
		if for_rows is not None:
			select_query += 'WHERE id = ANY(%s) '
		with pool.connection() as conn:
			curs = conn.execute(select_query + 'ORDER BY time', [] if for_rows is None else [for_rows])
			res = np.array(curs.fetchall(), dtype=dtype)
		return [res[:,i] for i in range(len(query))]

	def get_series_frame()