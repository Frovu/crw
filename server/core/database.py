import json, os
import psycopg2
import psycopg2.extras

pg_conn = psycopg2.connect(
	dbname = 'cr_aid',
	user = 'cr_aid',
	password = os.environ.get('DB_PASSWORD'),
	host = os.environ.get('DB_HOST')
)

from core.generic_columns import select_generics

dirname = os.path.dirname(__file__)
with open(os.path.join(dirname, '../config/tables.json')) as file:
	tables_info = json.load(file)

def init_view():
	generics = select_generics()
	with pg_conn.cursor() as cursor:
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
		for generic in generics:
			entity, name = generic.get('entity'), generic.get('name')
			columns.append(f'{entity}.{name} as {name}')
		select_query = f'SELECT {first_table}.id as id,\n{", ".join(columns)}\nFROM events.{first_table}\n' + '\n'.join(joins)
		view_query = 'CREATE VIEW events.default_view AS\n' + select_query
		cursor.execute('DROP VIEW IF EXISTS events.default_view')
		cursor.execute(view_query)

def render_tables_info():
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
	with open(os.path.join(dirname, '../data/tables_rendered.json'), 'w') as file:
		json.dump(info, file)

init_view()	
render_tables_info()

def select_all(t_from=None, t_to=None):
	with pg_conn.cursor() as cursor:
		cond = ' WHERE time >= %s' if t_from else ''
		if t_to: cond += (' AND' if cond else ' WHERE') + ' time < %s'
		cursor.execute('SELECT * FROM events.default_view' + cond + ' ORDER BY time', [p for p in [t_from, t_to] if p is not None])
		return cursor.fetchall(), [desc[0] for desc in cursor.description]