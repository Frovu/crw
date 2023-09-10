import json, os, logging
from datetime import datetime
from dataclasses import dataclass
from psycopg_pool import ConnectionPool
import numpy as np

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
			special text,
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

def import_fds(uid, import_columns, rows_to_add, ids_to_remove, precomputed_changes, root='forbush_effects'):
	log.info('Starting table import')
	rows = np.array(rows_to_add)
	with pool.connection() as conn, conn.cursor() as curs:
		if len(rows) > 0:
			inserted_ids = {t: np.full(len(rows), None) for t in tables_tree}
			for table, columns_dict in table_columns.items():
				index_names = [[i, name] for i, (tbl, name) in enumerate(import_columns) if tbl == table]
				if name := next((name for i, name in index_names if name not in columns_dict), None):
					raise ValueError(f'Not found {name} in {table}')
				indexes, names = zip(*index_names)
				data = rows[:,indexes]

				not_null = np.where(np.any((data != None) & (data != 0) , axis=1)) # pylint: disable=singleton-comparison

				for a_node, children in tables_tree.items():
					if table in children:
						# presumes parent was already inserted
						data = np.column_stack((inserted_ids[a_node], data))
						names = [tables_refs[(a_node, table)]] + list(names)

				data = data[not_null]
				if len(data) < 1:
					continue

				# presumes no conflicts to arise
				query = f'INSERT INTO events.{table} ({", ".join(names)}) VALUES ({("%s,"*len(names))[:-1]}) RETURNING id'
				curs.executemany(query, data.tolist(), returning=True)

				if table in tables_tree:
					ids = []
					while True:
						ids.append(curs.fetchone()[0])
						if not curs.nextset():
							break
					inserted_ids[table][not_null] = ids
			
		# TODO: do something with other associated entities
		curs.execute(f'DELETE FROM events.{root} WHERE id = ANY(%s)', [ids_to_remove])

		if len(precomputed_changes) > 0:
			sorted_changes = sorted(precomputed_changes, key=lambda c: c[0])
			root_ids, changes_lists = zip(*sorted_changes)
			id_columns = ','.join(t + '.id' for t in table_columns)
			curs.execute(f'SELECT {id_columns} FROM (select * from unnest(%s :: int[])) as ids(id) LEFT JOIN ' +\
					f'{select_from_root[root]} ON {root}.id = ids.id ORDER BY ids.id', [list(root_ids)])
			ids = dict(zip(table_columns.keys(), [list(a) for a in zip(*curs.fetchall())]))

			for i, changes in enumerate(changes_lists):
				for change in changes:
					entity, col_name, old_val, new_val = change['entity'], change['column'], change['before'], change['after']
					target_id = ids[entity][i]

					if target_id is None:
						orphaned = False
						for node, children in tables_tree.items():
							if entity in children and ids[node][i] is None:
								orphaned = True # skip orphaned by birth
						if orphaned:
							continue
						curs.execute(f'INSERT INTO events.{entity} DEFAULT VALUES RETURNING id')
						ids[entity][i] = target_id = curs.fetchone()[0]
						for node, children in tables_tree.items():
							if entity in children:
								ref = tables_refs[(node, entity)]
								curs.execute(f'UPDATE events.{entity} SET {ref} = %s ' + \
									'WHERE id = %s', [ids[node][i], target_id])

					if table_columns[entity][col_name].dtype == 'time':
						new_val = datetime.strptime(new_val, '%Y-%m-%dT%H:%M:%S.%fZ')
					curs.execute(f'UPDATE events.{entity} SET {col_name} = %s WHERE id = {target_id}', [new_val])
					if old_val is not None:
						curs.execute('INSERT INTO events.changes_log (author, special, event_id, ' + \
							'entity_name, column_name, old_value, new_value) VALUES (%s,%s,%s,%s,%s,%s,%s)',
							[uid, 'import', target_id, entity, col_name, old_val, new_val])
	log.info('Performed table import by uid=%s', uid)

'''
DROP TABLE IF EXISTS events.magnetic_clouds CASCADE;
DROP TABLE IF EXISTS events.solar_flares CASCADE;
DROP TABLE IF EXISTS events.coronal_holes CASCADE;
DROP TABLE IF EXISTS events.forbush_effects CASCADE;
DROP TABLE IF EXISTS events.coronal_mass_ejections CASCADE;
DROP TABLE IF EXISTS events.solar_sources CASCADE;
'''