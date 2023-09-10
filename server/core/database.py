import json, os, logging
from dataclasses import dataclass
from psycopg_pool import ConnectionPool

log = logging.getLogger('aides')
pool = ConnectionPool(kwargs = {
	'dbname': 'cr_aid',
	'user': 'cr_aid',
	'password': os.environ.get('DB_PASSWORD'),
	'host': os.environ.get('DB_HOST')
})

@dataclass
class ColumnDef:
	entity: str
	name: str   # sql column name
	computed: bool=False
	not_null: bool=False
	generic: dict=None       # generic column description
	pretty_name: str=None     # name visible by user
	dtype: str='real' # time|integer|real|text|enum
	enum: list=None
	references: str=None
	description: str=None
	parse_name: str=None
	parse_value: str=None
	parse_stub: str=None
	sql: str=None

	def enum_name(self):
		return f'enum_{self.entity}_{self.name}'

	def __post_init__(self):
		dtype = self.dtype
		if dtype == 'time':
			dtype = 'timestamp with time zone'
		if dtype == 'enum':
			dtype = 'text'
		if ref := self.references:
			dtype = f'integer REFERENCES events.{ref} ON DELETE SET NULL'
		if self.not_null:
			dtype += " NOT NULL"
		if self.enum:
			dtype += f' REFERENCES events.{self.enum_name()} ON UPDATE CASCADE'
		self.sql = self.name + ' ' + dtype

		if self.generic:
			self.computed = True

ENTITY_SHORT = {}
tables_tree = {}
select_from_root = {}
tables_refs = {}
all_columns = []
table_columns = {}

def _init():
	dirname = os.path.dirname(__file__)
	with pool.connection() as conn, \
			open(os.path.join(dirname, '../config/tables.json'), encoding='utf-8') as file:
		conn.execute('CREATE SCHEMA IF NOT EXISTS events')
		tables_json = json.load(file)
		for table, columns_dict in tables_json.items():
			ENTITY_SHORT[table] = ''.join([a[0].lower() for a in table.split('_')])
			columns = [ColumnDef(**desc, entity=table, name=name) for name, desc
				in columns_dict.items() if not name.startswith('_')]
			data_columns = [c for c in columns if not c.references]
			table_columns[table] = { c.name: c for c in data_columns }
			all_columns.extend(data_columns)
			for column in columns:
				if ref := column.references:
					tables_tree[ref] = tables_tree.get(ref, []) + [table]
					tables_refs[(ref, table)] = column.name
				if enum := column.enum:
					conn.execute(f'CREATE TABLE IF NOT EXISTS events.{column.enum_name()} (value TEXT PRIMARY KEY)')
					conn.execute(f'INSERT INTO events.{column.enum_name()} VALUES {",".join(["(%s)" for i in enum])} ON CONFLICT DO NOTHING', enum)
				conn.execute(f'ALTER TABLE IF EXISTS events.{table} ADD COLUMN IF NOT EXISTS {column.sql}')
			constraint = columns_dict.get('_constraint', '')
			create_columns = ',\n\t'.join(['id SERIAL PRIMARY KEY'] + [c.sql for c in columns])
			create_table  = f'CREATE TABLE IF NOT EXISTS events.{table} (\n\t{create_columns}\n{"," if constraint else ""}{constraint})'
			conn.execute(create_table)
		conn.execute('''CREATE TABLE IF NOT EXISTS events.changes_log (
			id SERIAL PRIMARY KEY,
			author integer references users on delete set null,
			time timestamptz not null default CURRENT_TIMESTAMP,
			event_id integer,
			entity_name text,
			column_name text,
			old_value text,
			new_value text)''')

		def get_joins(node, joins=''):
			for child in tables_tree.get(node, []):
				joins += f'LEFT JOIN events.{child} ON ' + \
					f'{node}.id = {child}.{tables_refs[(node, child)]}\n'
				joins += get_joins(child)
			return joins

		top_roots = [node for node, children in tables_tree.items() if
			not next((c for c in tables_tree.values() if node in c), False)]
		for root in top_roots:
			select_from_root[root] = f' events.{root}\n' + get_joins(root)
_init()

def upsert_many(table, columns, data, constants=[], conflict_constant='time', do_nothing=False):
	with pool.connection() as conn, conn.cursor() as cur, conn.transaction():
		cur.execute(f'CREATE TEMP TABLE tmp (LIKE {table} INCLUDING DEFAULTS) ON COMMIT DROP')
		for col in columns[:len(constants)]:
			cur.execute(f'ALTER TABLE tmp DROP COLUMN {col}')
		with cur.copy(f'COPY tmp({",".join(columns[len(constants):])}) FROM STDIN') as copy:
			for row in data:
				copy.write_row(row)
		placeholders = ','.join(['%s' for c in constants]) + ',' if constants else ''
		cur.execute(f'INSERT INTO {table}({",".join(columns)}) SELECT' +
			f'{placeholders}{",".join(columns[len(constants):])} FROM tmp ' +
			('ON CONFLICT DO NOTHING' if do_nothing else
			f'ON CONFLICT ({conflict_constant}) DO UPDATE SET ' +
			','.join([f'{c} = COALESCE(EXCLUDED.{c}, {table}.{c})'
			for c in columns if c not in conflict_constant])), constants)

# def import_fds(columns, rows_to_add, ids_to_remove, precomputed_changes):
# 	for table, col in columns:
# 		if col not in tables_info[table]:
# 			raise ValueError(f'{col} not found in {table}')
# 	with pool.connection() as conn:
# 		for table, column_desc in tables_info:
# 			pass
		