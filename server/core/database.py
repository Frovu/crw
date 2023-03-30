import json, os
from psycopg_pool import ConnectionPool
from psycopg import sql

pool = ConnectionPool(kwargs = {
	'dbname': 'cr_aid',
	'user': 'cr_aid',
	'password': os.environ.get('DB_PASSWORD'),
	'host': os.environ.get('DB_HOST')
}, min_size=40)

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
			f'ON CONFLICT ({conflict_constant}) DO UPDATE SET ' + ','.join([f'{c} = COALESCE(EXCLUDED.{c}, c)' for c in columns if c not in conflict_constant])), constants)

from core.generic_columns import select_generics, init_generics, SERIES

def render_table_info(uid):
	generics = select_generics(uid)
	info = dict()
	for i, (table, table_info) in enumerate(tables_info.items()):
		info[table] = dict()
		for col, col_desc in table_info.items():
			if col.startswith('_') or col_desc.get('references'):
				continue
			tag = ((table + '_') if i > 0 else '') + col
			info[table][tag] = {
				'name': col_desc.get('name', col),
				'type': col_desc.get('type', 'real')
			}
			if enum := col_desc.get('enum'):
				info[table][tag]['enum'] = enum
			if description := col_desc.get('description'):
				info[table][tag]['description'] = description
	for g in generics:
		first_table = list(tables_info)[0]
		name = f'{g.entity}_{g.name}' if g.entity != first_table else g.name
		info[g.entity][name] = {
			'name': g.pretty_name,
			'type': 'real',
			'description': g.description
		}
		if uid in g.users:
			info[g.entity][name]['user_generic_id'] = g.id
	series = { ser: SERIES[ser][1] for ser in SERIES }
	return { 'tables': info, 'series': series }

def select_events(t_from=None, t_to=None, uid=None):
	generics = select_generics(uid)
	columns, joins = [], []
	first_table = list(tables_info)[0]
	for table in tables_info:
		for column, desc in tables_info[table].items():
			if column.startswith('_'):
				continue
			if ref := desc.get('references'):
				joins.append(f'LEFT JOIN events.{ref} ON {ref}.id = {table}.{column}')
			else:
				col = f'{table}.{column}'
				value = f'EXTRACT(EPOCH FROM {col})::integer' if desc.get('type') == 'time' else col
				name = f'{table}_{column}' if table != first_table else column
				columns.append(f'{value} as {name}')
	for g in generics:
		name = f'{g.entity}_{g.name}' if g.entity != first_table else g.name
		columns.append(f'{g.entity}.{g.name} as {name}')
	select_query = f'SELECT {first_table}.id as id,\n{", ".join(columns)}\nFROM events.{first_table}\n' + '\n'.join(joins)
	with pool.connection() as conn:
		cond = ' WHERE time >= %s' if t_from else ''
		if t_to: cond += (' AND' if cond else ' WHERE') + ' time < %s'
		curs = conn.execute(select_query + cond + ' ORDER BY time', [p for p in [t_from, t_to] if p is not None])
		return curs.fetchall(), [desc[0] for desc in curs.description]