from dataclasses import dataclass, asdict
from typing import Literal, LiteralString
from psycopg.sql import SQL, Identifier, Composable
import ts_type

DTYPE = Literal['real', 'integer', 'time', 'text', 'enum']

@ts_type.gen_type
@dataclass
class Column:
	entity: str
	sql_name: str
	name: str = ''
	description: str = ''
	sql_def: Composable | LiteralString = ''
	is_computed: bool = False
	not_null: bool = False
	dtype: DTYPE = 'real'
	enum: list[str] | None = None
	parse_name: str | None = None
	parse_value: dict[str, str | None] | None = None
	parse_stub: str | None = None

	def __post_init__(self):
		if not self.name:
			self.name = self.sql_name

		if self.sql_def:
			self.sql_def = SQL(self.sql_def) if isinstance(self.sql_def, str) else self.sql_def
		else:
			dtype = self.dtype
			if dtype == 'time':
				dtype = 'timestamptz'
			if dtype == 'enum':
				dtype = 'text'

			self.sql_def = SQL(' ').join(filter(None, [
				SQL(dtype),
				self.not_null and SQL('NOT NULL'),
				self.enum and SQL('REFERENCES events.{} ON UPDATE CASCADE').format(Identifier(self.enum_table()))
			]))
	
	def sql_val(self):
		name = Identifier(self.sql_name)
		return SQL('EXTRACT(EPOCH FROM {0})::integer as {0}').format(name) if self.dtype == 'time' else name

	def sql_col_def(self):
		return SQL(' ').join([Identifier(self.sql_name), self.sql_def])

	def enum_table(self):
		return f'enum_{self.entity}_{self.name}'

	def as_dict(self):
		return asdict(self)