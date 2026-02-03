from dataclasses import dataclass, asdict
from typing import Literal, LiteralString
from psycopg.sql import SQL, Identifier, Composed
import ts_type

DTYPE = Literal['real', 'integer', 'time', 'text', 'enum']

@dataclass
class BaseColumn:
	entity: str
	sql_name: str
	name: str = ''
	description: str | None = None
	dtype: DTYPE = 'real'
	is_computed: bool = False

	def __post_init__(self):
		if not self.name:
			self.name = self.sql_name

	def as_dict(self):
		return asdict(self)
	
	def sql_type(self):
		if self.dtype == 'time':
			return SQL('timestamptz')
		if self.dtype == 'enum':
			return SQL('text')
		return SQL(self.dtype)
	
	def sql_val(self):
		name = Identifier(self.sql_name)
		return SQL('EXTRACT(EPOCH FROM {0})::integer as {0}').format(name) if self.dtype == 'time' else name

@ts_type.gen_type
@dataclass
class Column(BaseColumn):
	sql_def: LiteralString = ''
	not_null: bool = False
	enum: list[str] | None = None
	parse_name: str | None = None
	parse_value: dict[str, str | None] | None = None
	parse_stub: str | None = None
	type: Literal['static'] = 'static'

	def __post_init__(self):
		super().__post_init__()
		if 'not null' in self.sql_def.lower() or 'primary key' in self.sql_def.lower():
			self.not_null = True

	def sql_type_def(self):
		if self.sql_def:
			return Composed([SQL(self.sql_def)])

		return SQL(' ').join(filter(None, [
			self.sql_type(),
			self.not_null and SQL('NOT NULL'),
			self.enum and SQL('REFERENCES events.{} ON UPDATE CASCADE').format(Identifier(self.enum_table()))
		]))

	def sql_col_def(self):
		return SQL(' ').join([Identifier(self.sql_name), self.sql_type_def()])

	def enum_table(self):
		return f'enum_{self.entity}_{self.name}'
