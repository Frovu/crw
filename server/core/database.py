import json, os, logging
from datetime import datetime, timezone
from dataclasses import dataclass
from psycopg_pool import ConnectionPool

log = logging.getLogger('aides')
pool = ConnectionPool(kwargs = {
	'dbname': 'cr_aid',
	'user': 'cr_aid',
	'password': os.environ.get('DB_PASSWORD'),
	'host': os.environ.get('DB_HOST')
})

def entity_short(entity):
	return ''.join([a[0].lower() for a in entity.split('_')])

@dataclass
class ColumnDef:
	entity: str
	name: str   # sql column name
	computed: bool=False
	not_null: bool=False
	generic: dict=None       # generic column description
	pretty_name: str=id     # name visible by user
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

tables_tree = {}
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
			columns = [ColumnDef(**desc, entity=table, name=name) for name, desc
				in columns_dict.items() if not name.startswith('_')]
			data_columns = [c for c in columns if not c.references]
			table_columns[table] = data_columns
			all_columns.extend(data_columns)
			for column in columns:
				if ref := column.references:
					tables_tree[ref] = tables_tree.get(ref, []) + [table]
					tables_refs[(table, ref)] = column.name
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
_init()

print(tables_tree)

from core.generic_columns import select_generics, SERIES, DERIVED_TYPES

def get_joins_path(src, dst):
	if src == dst:
		return ''
	joins = ''
	def rec_find(a, b, path=[src], direction=[1]):
		if a == b:
			return path, direction
		lst = tables_tree.get(a)
		for ent in lst or []:
			if ent in path:
				continue
			if p := rec_find(ent, b, path + [ent], direction+[1]):
				return p
		upper = next((t for t, ent in tables_tree.items() if a in ent), None)
		if not upper or upper in path:
			return None
		return rec_find(upper, b, path + [upper], direction+[-1])
	found = rec_find(src, dst)
	if not found:
		raise ValueError('No path to entity')
	path, direction = found
	links = [[path[i], path[i+1], direction[i+1]] for i in range(len(path)-1)]
	for a, b, direction in links:
		master, slave = (a, b)[::direction]
		joins += f'LEFT JOIN events.{b} ON {slave}.id = {master}.{tables_refs.get((master, slave))}\n'
	return joins

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

def render_table_info(uid):
	generics = select_generics(uid)
	info = {}
	for table, columns in table_columns.items():
		info[table] = {}
		for col in columns:
			info[table][col] = {
				'parseName': col.parse_name,
				'parseValue': col.parse_value,
				'nullable': not col.not_null,
				'name': col.pretty_name,
				'type': col.type,
				'isComputed': col.computed
			}
			if col.enum:
				info[table][col]['enum'] = col.enum
			if col.description:
				info[table][col]['description'] = col.description
	for g in generics:
		info[g.entity][g.name] = {
			'name': g.pretty_name,
			'type': 'real',
			'description': g.description,
			'isComputed': True,
			'generic': {
				'id': g.id,
				'entity': g.entity,
				'type': g.type,
				'series': g.series,
				'poi': g.poi,
				'shift': g.shift
			}
		}
		if uid in g.users:
			info[g.entity][g.name]['user_generic_id'] = g.id
	series = { ser: SERIES[ser][2] for ser in SERIES }
	return { 'tables': info, 'series': series }

def select_events(uid=None, root='forbush_effects', changelog=False):
	generics = select_generics(uid)
	columns, joins = [], ''
	for table, columns in table_columns:
		for column in columns:
			if ref := column.references:
				joins += f'LEFT JOIN events.{ref} ON {ref}.id = {table}.{column}\n'
			else:
				col = f'{table}.{column}'
				value = f'EXTRACT(EPOCH FROM {col})::integer' if desc.get('type') == 'time' else col
				name = f'{ENTITY_SHORT[table]}_{column}'
				columns.append(f'{value} as {name}')
	for g in generics:
		name = f'{ENTITY_SHORT[g.entity]}_{g.name}'
		columns.append(f'{g.entity}.{g.name} as {name}')
	select_query = f'SELECT {root}.id as id,\n{", ".join(columns)}\nFROM events.{root}\n{joins} ORDER BY ' +\
		f'{root}.time' if 'time' in tables_info[root] else f'{root}.id'
	with pool.connection() as conn:
		curs = conn.execute(select_query)
		rows, fields = curs.fetchall(), [desc[0] for desc in curs.description]
		if changelog:
			entity_selector = '\nOR '.join([f'(entity_name = \'{ent}\' AND {ent}.id = event_id)' for ent in tables_info])
			query = f'''SELECT (SELECT {root}.id FROM events.{root} {joins} WHERE {entity_selector}) as root_id,
				entity_name, column_name, (select login from users where uid = author) as author, EXTRACT (EPOCH FROM time)::integer, old_value, new_value
				FROM events.changes_log WHERE column_name NOT LIKE \'g\\_\\_%%\' OR column_name = ANY(%s)
				ORDER BY root_id, column_name, time''' # this is cursed
			changes = conn.execute(query, ([g.name for g in generics],)).fetchall()
			rendered = dict()
			for eid, ent, column, author, at, old_val, new_val in changes:
				if eid not in rendered:
					rendered[eid] = dict()
				name = f'{ENTITY_SHORT[ent]}_{column}'
				if name not in rendered[eid]:
					rendered[eid][name] = list()
				rendered[eid][name].append({
					'time': at,
					'author': author,
					'old': old_val,
					'new': new_val
				})
		return rows, fields, rendered if changelog else None

def submit_changes(uid, changes, root='forbush_effects'):
	with pool.connection() as conn:
		for change in changes:
			root_id, entity, column, value = [change.get(w) for w in ['id', 'entity', 'column', 'value']]
			if entity not in tables_info:
				raise ValueError(f'Unknown entity: {entity}')
			found_column = tables_info[entity].get(column)
			generics = not found_column and select_generics(uid)
			found_generic = generics and next((g for g in generics if g.entity == entity and g.name == column), False)
			if not found_column and not found_generic:
				raise ValueError(f'Column not found: {column}')
			if found_generic and found_generic.type in DERIVED_TYPES:
				raise ValueError('Can\'t edit derived generics')
			dtype = found_column.get('type', 'real') if found_column else found_generic.data_type
			new_value = value
			if value is not None:
				if dtype == 'time':
					new_value = datetime.strptime(value, '%Y-%m-%dT%H:%M:%S.000Z')
				if dtype == 'real':
					new_value = float(value) if value != 'auto' else None
				if dtype == 'integer':
					new_value = int(value) if value != 'auto' else None
				if dtype == 'enum' and value is not None and value not in found_column.get('enum'):
					raise ValueError(f'Bad enum value: {value}')
			joins = get_joins_path(root, entity)
			res = conn.execute(f'SELECT {entity}.id, {entity}.{column} FROM events.{root} {joins} WHERE {root}.id = %s', [root_id]).fetchone()
			if not res:
				raise ValueError(f'Target event not found')
			target_id, old_value = res
			if value == old_value:
				raise ValueError(f'Value did not change: {old_value} == {value}')
			conn.execute(f'UPDATE events.{entity} SET {column} = %s WHERE id = %s', [new_value, target_id])
			new_value_str = 'auto' if new_value is None and value == 'auto' else new_value
			old_str, new_str = [v.replace(tzinfo=timezone.utc).timestamp() if dtype == 'time' else (v if v is None else str(v)) for v in [old_value, new_value_str]]
			conn.execute('INSERT INTO events.changes_log (author, event_id, entity_name, column_name, old_value, new_value) VALUES (%s,%s,%s,%s,%s,%s)',
				[uid, target_id, entity, column, old_str, new_str])
			log.info(f'Change authored by user ({uid}): {entity}.{column} {old_value} -> {new_value_str}')

def import_fds(columns, rows_to_add, ids_to_remove, precomputed_changes):
	for table, col in columns:
		if col not in tables_info[table]:
			raise ValueError(f'{col} not found in {table}')
	with pool.connection() as conn:
		for table, column_desc in tables_info:
			pass
		