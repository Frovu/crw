import os, logging
from psycopg_pool import ConnectionPool
from psycopg.sql import SQL, Identifier, Placeholder

from typing import LiteralString, Iterable, Sequence, Any

from events.columns.column import Column

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

def get_coverage(ent):
	with pool.connection() as conn:
		return conn.execute('SELECT start, i_end, at FROM coverage_info WHERE entity = %s', [ent]).fetchall()

def upsert_coverage(entity, start, end=None, single=False):
	with pool.connection() as conn:
		if single:
			conn.execute('DELETE FROM coverage_info WHERE entity = %s', [entity])
		conn.execute('INSERT INTO coverage_info (entity, start, i_end, at) VALUES (%s, %s, %s, now()) ' +\
			('' if single else 'ON CONFLICT(entity, start) DO UPDATE SET at = now(), i_end = EXCLUDED.i_end'), [entity, start, end])

def upsert_many(table: str, columns: list[str], data: Iterable[Sequence[Any]], schema='events', constants: list[Any]=[], conflict_constraint:LiteralString='time', do_nothing=False, write_nulls=False, write_values=True):
	with pool.connection() as conn, conn.cursor() as cur, conn.transaction():
		tmpname = Identifier(table.split('.')[-1] + '_tmp')
		itable = SQL('.').join([Identifier(schema), Identifier(table)])
		icolumns = [Identifier(c) for c in columns]

		cur.execute(SQL('DROP TABLE IF EXISTS {}').format(tmpname))
		cur.execute(SQL('CREATE TEMP TABLE {} (LIKE {} INCLUDING DEFAULTS) ON COMMIT DROP').format(tmpname, itable))
		for col in icolumns[:len(constants)]:
			cur.execute(SQL('ALTER TABLE {} DROP COLUMN {}').format(itable, col))

		val_columns = SQL(',').join(icolumns[len(constants):])
		with cur.copy(SQL('COPY {}({}) FROM STDIN').format(tmpname, val_columns)) as copy:
			for row in data:
				copy.write_row(row)
				
		if do_nothing:
			on_conflict = SQL('ON CONFLICT DO NOTHING')
		else:
			items = []
			for c in icolumns:
				if c.as_string() in conflict_constraint:
					continue
				if write_nulls:
					items.append(SQL('{0} = EXCLUDED.{0}').format(c)) 
				elif write_values:
					items.append(SQL('{0} = COALESCE(EXCLUDED.{0}, {1}.{0})').format(c, itable))
				else:
					items.append(SQL('{0} = COALESCE({1}.{0}, EXCLUDED.{0})').format(c, itable))
	
			on_conflict = SQL('ON CONFLICT ({}) DO UPDATE SET {}')\
				.format(SQL(conflict_constraint), SQL(',').join(items))
			
		col_names = SQL(',').join(icolumns)
		col_values = SQL(',').join([*map(Placeholder, constants), val_columns])
		query = SQL('INSERT INTO {}({}) SELECT {} FROM {} {}').format(itable, col_names, col_values, tmpname, on_conflict)
			
		cur.execute(query, constants)

def create_table(name: str, columns: list[Column], constraint: LiteralString='', schema='events'):
	table = SQL('.').join([Identifier(schema), Identifier(name)]) if schema else Identifier(name)
	cols = SQL(',\n').join([c.sql_col_def() for c in columns if c])
	col_def = SQL(',\n').join([cols, SQL(constraint)]) if constraint else cols
	query = SQL('CREATE TABLE IF NOT EXISTS {} (\n{})').format(table, col_def)
	
	with pool.connection() as conn:
		conn.execute(query)