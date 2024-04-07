from datetime import datetime
import numpy as np
from database import pool, log
from events.table_structure import FEID, FEID_SOURCE, SOURCE_CH, SOURCE_ERUPT

def _init():
	with pool.connection() as conn:
		conn.execute('CREATE SCHEMA IF NOT EXISTS events')
		for tbl in [FEID, SOURCE_CH, SOURCE_ERUPT, FEID_SOURCE]:
			table, columns = tbl
			for column in columns.values():
				if enum := column.enum:
					conn.execute(f'CREATE TABLE IF NOT EXISTS events.{column.enum_name()} (value TEXT PRIMARY KEY)')
					conn.execute(f'INSERT INTO events.{column.enum_name()} VALUES {",".join(["(%s)" for i in enum])} '+\
						'ON CONFLICT DO NOTHING', enum)
				conn.execute(f'ALTER TABLE IF EXISTS events.{table} ADD COLUMN IF NOT EXISTS {column.sql}')
			create_columns = ',\n\t'.join([c.sql for c in columns])
			create_table = f'CREATE TABLE IF NOT EXISTS events.{table} (\n\t{create_columns}))'
			conn.execute(create_table)

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
