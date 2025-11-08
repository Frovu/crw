from dataclasses import dataclass

@dataclass
class ColumnDef:
	entity: str
	name: str   # sql column name
	computed: bool=False
	not_null: bool=False
	generic: dict=None       # generic column description
	pretty_name: str=None     # name visible by user
	data_type: str='real' # time|integer|real|text|enum
	enum: list=None
	description: str=None
	parse_name: str=None
	parse_value: str=None
	parse_stub: str=None
	sql: str=None
	rel: str=None

	def enum_name(self):
		return f'enum_{self.entity}_{self.name}'

	def __post_init__(self):
		if self.sql:
			return

		dtype = self.data_type
		if dtype == 'time':
			dtype = 'timestamptz'
		if dtype == 'enum':
			dtype = 'text'
		if self.not_null:
			dtype += ' NOT NULL'
		if self.enum:
			dtype += f' REFERENCES events.{self.enum_name()} ON UPDATE CASCADE'
		self.sql = self.name + ' ' + dtype

		if self.generic:
			self.computed = True

	def as_dict(self):
		col = {
			'id': self.name,
			'entity': self.entity,
			'parseName': self.parse_name,
			'parseValue': self.parse_value,
			'nullable': not self.not_null,
			'name': self.pretty_name or self.name,
			'type': self.data_type,
			'isComputed': self.computed,
			'rel': self.rel
		}
		if self.enum:
			col['enum'] = self.enum
		if self.description:
			col['description'] = self.description
		return col