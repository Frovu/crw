import sys, os
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../core'))
from database import pg_conn, tables_info

def enum_name(table, column):
	return f'enum_{table}_{column}'

def column_definition(table, name, desc):
	dtype = desc.get('type', 'real')
	if dtype == 'time':
		dtype = 'timestamp with time zone'
	if dtype == 'enum':
		dtype = 'text'
	if ref := desc.get("references"):
		dtype = f'integer REFERENCES {ref} ON DELETE SET NULL'
	if desc.get("not_null"):
		dtype += " NOT NULL"
	if desc.get("enum"):
		dtype += f' REFERENCES {enum_name(table, name)} ON UPDATE CASCADE'
	return f'{name} {dtype}'

if __name__ == '__main__':
	with pg_conn.cursor() as cursor:
		for table, table_desc in list(tables_info.items())[::-1]:
			columns = [k for k in table_desc if not k.startswith('_')]
			create_columns = ',\n\t'.join(['id SERIAL PRIMARY KEY'] + [column_definition(table, c, table_desc[c]) for c in columns])
			constraint = table_desc.get('_constraint')
			create_table = f'CREATE TABLE IF NOT EXISTS {table} (\n\t{create_columns}\n{(","+constraint) if constraint else ""})'
			print(create_table)
			cursor.execute(create_table)
			for column in columns:
				desc = table_desc[column]
				if enum := desc.get('enum'):
					cursor.execute(f'CREATE TABLE IF NOT EXISTS {enum_name(table, column)} (value TEXT PRIMARY KEY)')
					cursor.execute(f'INSERT INTO {enum_name(table, column)} VALUES {",".join(["(%s)" for i in enum])} ON CONFLICT DO NOTHING', enum)
					print(enum_name(table, column), "=", " | ".join(enum))
				cursor.execute(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column_definition(table, column, desc)}')
			print()
		
		columns, joins = [], []
		first_table = list(tables_info)[0]
		for table in tables_info:
			for column, desc in tables_info[table].items():
				if column.startswith('_'):
					continue
				if ref := desc.get('references'):
					joins.append(f'LEFT JOIN {ref} ON {ref}.id = {table}.{column}')
				else:
					name = f'{table}_{column}' if table != first_table else column
					columns.append(f'{table}.{column} as {name}')
		select_query = f'SELECT\n{", ".join(columns)}\nFROM {first_table}\n' + '\n'.join(joins)
		view_query = 'CREATE VIEW default_view AS\n' + select_query
		print(view_query)
		cursor.execute('DROP VIEW default_view')
		cursor.execute(view_query)
	pg_conn.commit()