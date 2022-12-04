import sys, os
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../core'))
from database import pg_conn, list_columns, get_column_type, TABLE_NAME

if __name__ == '__main__':
	rtype = lambda t: 'timestamp with time zone' if t == 'time' else t
	columns = ',\n\t'.join([c+' '+rtype(get_column_type(c)) for c in list_columns()])
	with pg_conn.cursor() as cursor:
		text = f'''CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
	id serial primary key,
	{columns},
	UNIQUE (time))'''
		print(text)
		cursor.execute(text)
		for col in list_columns():
			cursor.execute(f'ALTER TABLE {TABLE_NAME} ADD COLUMN IF NOT EXISTS {col} {get_column_type(col)}')
		pg_conn.commit()