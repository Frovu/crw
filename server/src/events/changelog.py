from dataclasses import dataclass
from typing import Literal
from database import pool
import ts_type

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