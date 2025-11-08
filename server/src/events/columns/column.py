from dataclasses import dataclass
from typing import Literal
import ts_type

DTYPE = Literal['real', 'integer', 'time', 'text', 'enum']

@ts_type.gen_type
@dataclass
class Column:
	entity: str
	sql_name: str
	name: str = ''
	sql_type: str = ''
	description: str = ''
	is_computed: bool = False
	not_null: bool = False
	dtype: DTYPE = 'real'
	enum: list[str] | None = None
	parse_name: str | None = None
	parse_value: str | None = None
	parse_stub: str | None = None

	def __post_init__(self):
		if not self.name:
			self.name = self.sql_name

		if not self.sql_type:
			dtype = self.dtype
			if dtype == 'time':
				dtype = 'timestamptz'
			if dtype == 'enum':
				dtype = 'text'
			if self.not_null:
				dtype += ' NOT NULL'
			if self.enum:
				dtype += f' REFERENCES events.{self.enum_table()} ON UPDATE CASCADE'
			self.sql_type = dtype

	def enum_table(self):
		return f'enum_{self.entity}_{self.name}'
