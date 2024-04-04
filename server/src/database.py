import os, logging
from psycopg_pool import ConnectionPool

log = logging.getLogger('crw')
pool = ConnectionPool(kwargs = {
	'dbname': 'crw',
	'user': 'crw',
	'password': os.environ.get('DB_PASSWORD'),
	'host': os.environ.get('DB_HOST')
})

def _init():
	with pool.connection() as conn:
		conn.execute('''CREATE TABLE IF NOT EXISTS coverage_info (
			entity TEXT NOT NULL,
			start TIMESTAMPTZ NOT NULL,
			i_end TIMESTAMPTZ,
			at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(entity, start))''')
_init()

def upsert_coverage(entity, start, end, single=False):
	with pool.connection() as conn:
		if single:
			conn.execute('DELETE FROM coverage_info WHERE entity = %s', [entity])
		conn.execute('INSERT INTO coverage_info (entity, start, i_end, at) VALUES (%s, %s, %s, now()) ' +\
			('' if single else 'ON CONFLICT(entity, start) DO UPDATE SET at = now(), i_end = EXCLUDED.i_end'), [entity, start, end])

def upsert_many(table, columns, data, constants=[], conflict_constraint='time', do_nothing=False, write_nulls=False, write_values=True):
	with pool.connection() as conn, conn.cursor() as cur, conn.transaction():
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
