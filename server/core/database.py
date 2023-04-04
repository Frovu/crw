import json, os, logging
from psycopg_pool import ConnectionPool
from psycopg import sql

log = logging.getLogger('aides')
pool = ConnectionPool(kwargs = {
	'dbname': 'cr_aid',
	'user': 'cr_aid',
	'password': os.environ.get('DB_PASSWORD'),
	'host': os.environ.get('DB_HOST')
})

dirname = os.path.dirname(__file__)
with open(os.path.join(dirname, '../config/tables.json')) as file:
	tables_info = json.load(file)
	tables_tree = dict()
	tables_refs = dict()
	for table in tables_info:
		for column, desc in tables_info[table].items():
			if column.startswith('_'): continue
			if ref := desc.get('references'):
				tables_tree[table] = (tables_tree.get(table) or []) + [ref]
				tables_refs[(table, ref)] = column
ENTITY_SHORT = {t: ''.join([a[0].lower() for a in t.split('_')]) for t in tables_info}

def enum_name(table, column):
	return f'enum_{table}_{column}'

def column_definition(table, name, desc):
	dtype = desc.get('type', 'real')
	if dtype == 'time':
		dtype = 'timestamp with time zone'
	if dtype == 'enum':
		dtype = 'text'
	if ref := desc.get("references"):
		dtype = f'integer REFERENCES events.{ref} ON DELETE SET NULL'
	if desc.get("not_null"):
		dtype += " NOT NULL"
	if desc.get("enum"):
		dtype += f' REFERENCES events.{enum_name(table, name)} ON UPDATE CASCADE'
	return f'{name} {dtype}'

with pool.connection() as conn:
	conn.execute('CREATE SCHEMA IF NOT EXISTS events')
	for table, table_desc in list(tables_info.items())[::-1]:
		columns = [k for k in table_desc if not k.startswith('_')]
		for column in columns:
			desc = table_desc[column]
			if enum := desc.get('enum'):
				conn.execute(f'CREATE TABLE IF NOT EXISTS events.{enum_name(table, column)} (value TEXT PRIMARY KEY)')
				conn.execute(f'INSERT INTO events.{enum_name(table, column)} VALUES {",".join(["(%s)" for i in enum])} ON CONFLICT DO NOTHING', enum)
			column_def = column_definition(table, column, desc)
			conn.execute(f'ALTER TABLE IF EXISTS events.{table} ADD COLUMN IF NOT EXISTS {column_def}')
		create_columns = ',\n\t'.join(['id SERIAL PRIMARY KEY'] + [column_definition(table, c, table_desc[c]) for c in columns])
		constraint = table_desc.get('_constraint')
		create_table = f'CREATE TABLE IF NOT EXISTS events.{table} (\n\t{create_columns}\n{(","+constraint) if constraint else ""})'
		conn.execute(create_table)

def upsert_many(table, columns, data, constants=[], conflict_constant='time', do_nothing=False):
	with pool.connection() as conn, conn.cursor() as cur, conn.transaction():
		cur.execute(f'CREATE TEMP TABLE tmp (LIKE {table} INCLUDING DEFAULTS) ON COMMIT DROP')
		for c, z in zip(columns, constants):
			cur.execute(f'ALTER TABLE tmp DROP COLUMN {c}')
		with cur.copy(f'COPY tmp({",".join(columns[len(constants):])}) FROM STDIN') as copy:
			for row in data:
				copy.write_row(row)
		placeholders = ','.join(['%s' for c in constants]) + ',' if constants else ''
		cur.execute(f'INSERT INTO {table}({",".join(columns)}) SELECT {placeholders}{",".join(columns[len(constants):])} FROM tmp ' +
			('ON CONFLICT DO NOTHING' if do_nothing else
			f'ON CONFLICT ({conflict_constant}) DO UPDATE SET ' + ','.join([f'{c} = COALESCE(EXCLUDED.{c}, {table}.{c})' for c in columns if c not in conflict_constant])), constants)

from core.generic_columns import select_generics, init_generics, SERIES

def render_table_info(uid):
	generics = select_generics(uid)
	info = dict()
	for i, (table, table_info) in enumerate(tables_info.items()):
		info[table] = dict()
		for col, col_desc in table_info.items():
			if col.startswith('_') or col_desc.get('references'):
				continue
			tag = ENTITY_SHORT[table] + '_' + col
			info[table][tag] = {
				'name': col_desc.get('name', col),
				'type': col_desc.get('type', 'real')
			}
			if enum := col_desc.get('enum'):
				info[table][tag]['enum'] = enum
			if description := col_desc.get('description'):
				info[table][tag]['description'] = description
	for g in generics:
		name = ENTITY_SHORT[g.entity] + '_' + g.name
		info[g.entity][name] = {
			'name': g.pretty_name,
			'type': 'real',
			'description': g.description
		}
		if uid in g.users:
			info[g.entity][name]['user_generic_id'] = g.id
	series = { ser: SERIES[ser][1] for ser in SERIES }
	return { 'tables': info, 'series': series }

def select_events(t_from=None, t_to=None, uid=None, first_table='forbush_effects'):
	generics = select_generics(uid)
	columns, joins = [], []
	for table in tables_info:
		for column, desc in tables_info[table].items():
			if column.startswith('_'):
				continue
			if ref := desc.get('references'):
				joins.append(f'LEFT JOIN events.{ref} ON {ref}.id = {table}.{column}')
			else:
				col = f'{table}.{column}'
				value = f'EXTRACT(EPOCH FROM {col})::integer' if desc.get('type') == 'time' else col
				name = f'{ENTITY_SHORT[table]}_{column}'
				columns.append(f'{value} as {name}')
	for g in generics:
		name = f'{ENTITY_SHORT[g.entity]}_{g.name}'
		columns.append(f'{g.entity}.{g.name} as {name}')
	select_query = f'SELECT {first_table}.id as id,\n{", ".join(columns)}\nFROM events.{first_table}\n' + '\n'.join(joins)
	with pool.connection() as conn:
		cond = ' WHERE time >= %s' if t_from else ''
		if t_to: cond += (' AND' if cond else ' WHERE') + ' time < %s'
		curs = conn.execute(select_query + cond + f' ORDER BY {first_table}.time', [p for p in [t_from, t_to] if p is not None])
		return curs.fetchall(), [desc[0] for desc in curs.description]