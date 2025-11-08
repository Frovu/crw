from datetime import datetime
import numpy as np
from database import create_table, pool, log
from events.table_structure import ALL_TABLES, E_FEID, E_FEID_SOURCE, E_SOURCE_CH, E_SOURCE_ERUPT
from psycopg.sql import SQL, Identifier

def _init():
	with pool.connection() as conn:
		conn.execute('CREATE SCHEMA IF NOT EXISTS events')
		for tbl in [E_FEID, E_FEID_SOURCE, E_SOURCE_CH, E_SOURCE_ERUPT]:
			columns = ALL_TABLES[tbl]
			create_table(tbl, columns)
			
			for column in columns:
				if enum := column.enum:
					ienum = Identifier(column.enum_table())
					conn.execute(SQL('CREATE TABLE IF NOT EXISTS events.{} (value TEXT PRIMARY KEY)').format(ienum))
					vals = SQL(',').join([SQL('(%s)') for _ in enum])
					conn.execute(SQL('INSERT INTO events.{} VALUES {} ON CONFLICT DO NOTHING').format(ienum, vals), enum)

				itable = Identifier(tbl)
				iname = Identifier(column.sql_name)
				itype = SQL(column.sql_def.as_string().split(' ')[0]) # type: ignore
				
				if column.sql_name != 'id':
					conn.execute(SQL('ALTER TABLE events.{} ADD COLUMN IF NOT EXISTS {}').format(itable, column.sql_col_def()))
					conn.execute(SQL('ALTER TABLE events.{} ALTER COLUMN {} TYPE {}').format(itable, iname, itype))

					not_null = SQL('SET' if column.not_null else 'DROP')
					conn.execute(SQL('ALTER TABLE events.{} ALTER COLUMN {} {} NOT NULL').format(itable, iname, not_null))

		conn.execute('''CREATE TABLE IF NOT EXISTS events.changes_log (
			id SERIAL PRIMARY KEY,
			author integer references users on delete set null,
			time timestamptz not null default CURRENT_TIMESTAMP,
			special text,
			event_id integer,
			entity_name text,
			column_name text,
			old_value text,
			new_value text)''')
_init()

def import_fds(uid, import_columns, rows_to_add, ids_to_remove, precomputed_changes):
	raise NotImplementedError('FIXME: import fds be broke')
	log.info('Starting table import')
	rows = np.array(rows_to_add)
	with pool.connection() as conn, conn.cursor() as curs:
		if len(rows) > 0:
			not_null = np.where(np.any((rows != None) & (rows != 0) , axis=1)) # pylint: disable=singleton-comparison
			data = rows[not_null]

			# presumes no conflicts to arise
			query = f'INSERT INTO events.feid ({", ".join(import_columns)}) '+\
				f'VALUES ({("%s,"*len(import_columns))[:-1]}) RETURNING id'
			curs.executemany(query, data.tolist(), returning=True)
			
		curs.execute('DELETE FROM events.feid WHERE id = ANY(%s)', [ids_to_remove])

		if len(precomputed_changes) > 0:
			sorted_changes = sorted(precomputed_changes, key=lambda c: c[0])

			for feid_id, changes in sorted_changes:
				for change in changes:
					col_name, old_val, new_val = change['column'], change['before'], change['after']

					if FEID[1][col_name].data_type == 'time' and new_val is not None:
						new_val = datetime.strptime(new_val, '%Y-%m-%dT%H:%M:%S.%fZ')
					curs.execute(f'UPDATE events.feid SET {col_name} = %s WHERE id = %s', [new_val, feid_id])
					if old_val is not None:
						curs.execute('INSERT INTO events.changes_log (author, special, event_id, ' + \
							'entity_name, column_name, old_value, new_value) VALUES (%s,%s,%s,%s,%s,%s,%s)',
							[uid, 'import', feid_id, 'feid', col_name, old_val, new_val])
	log.info('Performed table import by uid=%s', uid)
