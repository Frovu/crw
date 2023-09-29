import os, logging
from psycopg_pool import ConnectionPool

log = logging.getLogger('aides')
pool = ConnectionPool(kwargs = {
	'dbname': 'cr_aid',
	'user': 'cr_aid',
	'password': os.environ.get('DB_PASSWORD'),
	'host': os.environ.get('DB_HOST')
})

def upsert_many(table, columns, data, constants=[], conflict_constraint='time', do_nothing=False, write_nulls=False, write_values=True, conn=None):
	aconn = pool.connection() if conn is None else conn
	try:
		with aconn.cursor() as cur, aconn.transaction():
			tmpname = table.split('.')[-1] + '_tmp'
			cur.execute(f'DROP TABLE IF EXISTS {tmpname}')
			cur.execute(f'CREATE TEMP TABLE {tmpname} (LIKE {table} INCLUDING DEFAULTS) ON COMMIT DROP')
			for col in columns[:len(constants)]:
				cur.execute(f'ALTER TABLE {tmpname} DROP COLUMN {col}')
			with cur.copy(f'COPY {tmpname}({",".join(columns[len(constants):])}) FROM STDIN') as copy:
				for row in data:
					copy.write_row(row)
			placeholders = (','.join(['%s' for c in constants]) + ',') if constants else ''
			cur.execute(f'INSERT INTO {table}({",".join(columns)}) SELECT ' +
				f'{placeholders}{",".join(columns[len(constants):])} FROM {tmpname} ' +
				('ON CONFLICT DO NOTHING' if do_nothing else
				f'ON CONFLICT ({conflict_constraint}) DO UPDATE SET ' +
					','.join([f'{c} = EXCLUDED.{c}' if write_nulls else f'{c} = COALESCE(EXCLUDED.{c}, {table}.{c})' if write_values
						else f'{c} = COALESCE({table}.{c}, EXCLUDED.{c})'
						for c in columns if c not in conflict_constraint])), constants)
	except BaseException as exc:
		aconn.rollback()
		raise exc
	else:
		if conn is None:
			aconn.commit()
	finally:
		if conn is None:
			aconn.close()
