from datetime import datetime
from dataclasses import dataclass, field
import ts_type

from psycopg.rows import dict_row
from database import pool
from events.columns.column import Column

DEF_TABLE = 'computed_columns'
DATA_TABLE = 'computed_columns_data'

@ts_type.gen_type
@dataclass
class ComputedColumn(Column):
	id: int = field(kw_only=True)
	created_at: datetime = field(kw_only=True)
	computed_at: datetime | None = None
	owner_id: int = field(kw_only=True)
	is_public: bool = field(kw_only=True)
	definition: str = field(kw_only=True)

	@classmethod
	def from_sql_row(cls, row):
		row['entity'] = DATA_TABLE
		row['sql_name'] = f'c_{row['id']}'
		row['is_computed'] = True
		return cls(**row)

def _init_column(conn, col: ComputedColumn):
	conn.execute(f'ALTER TABLE events.{DATA_TABLE} ADD COLUMN IF NOT EXISTS {col.sql_name} {col.sql_def}')

def _sql_init():
	with pool.connection() as conn:
		conn.execute(f'''CREATE TABLE IF NOT EXISTS events.{DEF_TABLE} (
			id serial primary key,
			name text not null,
			description text,
			created_at timestamp with time zone not null default CURRENT_TIMESTAMP,
			computed_at timestamp with time zone,
			owner_id int references users,
			is_public boolean not null default 'f',
			definition text)''')
		conn.execute(f'CREATE TABLE IF NOT EXISTS events.{DATA_TABLE} ('+
			'feid_id INTEGER NOT NULL UNIQUE REFERENCES events.feid ON DELETE CASCADE)')
		
	cols = select_computed_columns(select_all=True)
	with pool.connection() as conn:
		for col in cols:
			_init_column(conn, col)

def select_computed_columns(user_id: int | None=None, select_all=False):
	with pool.connection() as conn:
		where = ' WHERE is_public' + ('' if user_id is None else ' OR %s = owner_id')
		curs = conn.execute(f'SELECT * from events.{DEF_TABLE}' + ('' if select_all else where),
			[] if user_id is None else [user_id])
		curs.row_factory = dict_row

		return [ComputedColumn.from_sql_row(row) for row in curs]
_sql_init()
