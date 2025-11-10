from dataclasses import dataclass
from typing import Literal
from database import pool
from psycopg import Connection, sql
import ts_type

from events.columns.column import Column

TABLE = 'changes_log'

@ts_type.gen_type
@dataclass
class ChangelogEntry:
	time: int
	author: str
	old: str
	new: str
	special: Literal['import'] | None

@ts_type.gen_type
@dataclass
class ChangelogResponse:
	fields: list[str]
	events: dict[str, dict[str, list[list[float | None | str]]]]

def _init():
	with pool.connection() as conn:
		conn.execute(f'''CREATE TABLE IF NOT EXISTS events.{TABLE} (
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

def select_changelog(conn: Connection, entity: str, columns: list[Column]):
	# TODO: optimization
	changelog = ChangelogResponse(['time', 'author', 'old', 'new', 'special'], {})
	query = sql.SQL('''SELECT event_id, column_name, special, old_value, new_value,
		EXTRACT (EPOCH FROM changes_log.time)::integer,
		(select login from users where uid = author) as author
		FROM events.changes_log WHERE event_id is not null
		AND entity_name={} AND column_name = ANY(%s)''').format(sql.Identifier(entity))
	res = conn.execute(query, [[c.sql_name for c in columns]]).fetchall()

	tgt = changelog.events
	for eid, column, special, old_val, new_val, made_at, author in res:
		if eid not in tgt:
			tgt[eid] = {}
		if column not in tgt[eid]:
			tgt[eid][column] = []
		tgt[eid][column].append([made_at, author, old_val, new_val, special])
	
	return changelog