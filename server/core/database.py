import json, os
import psycopg2

pg_conn = psycopg2.connect(
	dbname = 'cr_aid',
	user = 'cr_aid',
	password = os.environ.get('DB_PASSWORD'),
	host = os.environ.get('DB_HOST')
)

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
	with pg_conn.cursor() as cursor:
		cond = ' WHERE time >= %s' if t_from else ''
		if t_to: cond += (' AND' if cond else ' WHERE') + ' time < %s'
		cursor.execute(select_query + cond + ' ORDER BY time', [p for p in [t_from, t_to] if p is not None])
		return cursor.fetchall(), [desc[0] for desc in cursor.description]