from datetime import datetime
from dataclasses import dataclass, field
from typing import Literal
import ts_type

from psycopg import Connection, rows, sql
from database import pool, log
from events.columns.column import BaseColumn


DEF_TABLE = 'computed_columns'
DATA_TABLE = 'computed_columns_data'

@ts_type.gen_type
@dataclass
class ComputedColumn(BaseColumn):
	id: int = field(kw_only=True)
	created_at: datetime = field(kw_only=True)
	computed_at: datetime | None = None
	owner_id: int = field(kw_only=True)
	is_public: bool = field(kw_only=True)
	is_own: bool = field(kw_only=True)
	definition: str = field(kw_only=True)
	type: Literal['computed'] = 'computed'

	@classmethod
	def from_sql_row(cls, row, user_id: int | None = None):
		row['entity'] = DATA_TABLE
		row['sql_name'] = f'c_{row['id']}'
		row['is_computed'] = True
		row['is_own'] = row['owner_id'] == user_id
		return cls(**row)
	
	def init_in_table(self, conn: Connection):
		iname, itype = sql.Identifier(self.sql_name), self.sql_type()
		conn.execute(sql.SQL(f'ALTER TABLE events.{DATA_TABLE} ADD COLUMN IF NOT EXISTS {{}} {{}}').format(iname, itype))

def _sql_init():
	with pool.connection() as conn:
		conn.execute(f'''CREATE TABLE IF NOT EXISTS events.{DEF_TABLE} (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT,
			created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
			computed_at timestamptz,
			owner_id INT REFERENCES users,
			is_public BOOLEAN NOT NULL DEFAULT 'f',
			definition text)''')
		conn.execute(f'CREATE TABLE IF NOT EXISTS events.{DATA_TABLE} ('+
			'feid_id INTEGER NOT NULL UNIQUE REFERENCES events.feid ON DELETE CASCADE)')
		
	cols = select_computed_columns(select_all=True)
	with pool.connection() as conn:
		for col in cols:
			col.init_in_table(conn)

def select_computed_columns(user_id: int | None=None, select_all=False):
	with pool.connection() as conn:
		where = ' WHERE is_public' + ('' if user_id is None else ' OR %s = owner_id')
		curs = conn.execute(f'SELECT * from events.{DEF_TABLE}' + ('' if select_all else where),
			[] if user_id is None else [user_id])
		curs.row_factory = rows.dict_row

		return [ComputedColumn.from_sql_row(row, user_id) for row in curs]
_sql_init()

def apply_changes(conn, column, table=DATA_TABLE, dtype='real'):
	id_col = 'feid_id' if table == DATA_TABLE else 'id'
	curs = conn.execute(f'UPDATE events.{table} tgt SET {column} = new_value::{dtype} ' +
		'FROM (SELECT DISTINCT ON (event_id) event_id, new_value FROM events.changes_log ' +
		'WHERE entity_name = \'feid\' AND column_name = %s ORDER BY event_id, time DESC) chgs ' +
		f'WHERE tgt.{id_col} = event_id AND (new_value IS NULL OR new_value != \'auto\')', [column])
	log.info(f'Applied {curs.rowcount} overriding changes to {column}')
