from datetime import datetime, timezone
from dataclasses import dataclass, asdict
import ts_type
from database import pool, log
from psycopg.sql import SQL, Identifier, Placeholder

from events.changelog import ChangelogResponse, select_changelog
from events.columns.column import Column
from events.table_structure import ALL_TABLES, E_FEID, EDITABLE_TABLES, FEID, FEID_SOURCE, E_SOURCE_CH, E_SOURCE_ERUPT, SOURCE_CH, SOURCE_ERUPT, SELECT_FEID
from events.columns.computed_column import select_computed_columns, DATA_TABLE as CC_TABLE

@ts_type.gen_type
@dataclass
class TableDataResponse:
	columns: list[Column]
	data: list[list[float | str | None]]
	changelog: ChangelogResponse | None = None

	def to_dict(self):
		return asdict(self)


def select_events(entity: str, user_id: int|None=None, include: list[str]|None=None, changelog=False):
	if entity not in ALL_TABLES:
		raise NameError(f'Unknown entity: \'{entity}\'')
	
	is_feid = entity == 'feid'
	cols = ALL_TABLES[entity]
	if is_feid:
		cols = [*cols, *select_computed_columns(user_id)]
	columns = cols if include is None else [c for c in cols if c.name in include]

	col_q = SQL(',').join([c.sql_val() for c in cols])
	time_col = next((c for c in cols if 'time' in c.sql_name), None)
	order = Identifier(time_col.sql_name if time_col else 'id')

	join_ccs = SQL(f'LEFT JOIN events.{CC_TABLE} ON id = feid_id ' if is_feid else '')
	query = SQL('SELECT {} FROM events.{} {} ORDER BY {}').format(col_q, Identifier(entity), join_ccs, order)

	with pool.connection() as conn:
		data = conn.execute(query).fetchall()

		resp = TableDataResponse(columns, data)

		if changelog:
			resp.changelog = select_changelog(conn, entity, columns)

	if is_feid:
		log.info('FEID rendered for %s', (('user #'+str(user_id)) if user_id is not None else 'anon'))
	return resp.to_dict()

def link_source(feid_id: int, entity: str, existing_id = None):
	with pool.connection() as conn:
		assert entity in [E_SOURCE_CH, E_SOURCE_ERUPT]
		if existing_id is not None:
			se_id = existing_id
		else:
			query = SQL('INSERT INTO events.{} DEFAULT VALUES RETURNING id').format(Identifier(entity))
			res = conn.execute(query).fetchone()
			se_id = res and res[0]
		link_col = 'ch_id' if entity == E_SOURCE_CH else 'erupt_id'
		query = SQL(f'INSERT INTO events.{E_FEID} (feid_id, {{}}) VALUES (%s, %s) RETURNING id').format(Identifier(link_col))
		res = conn.execute(query).fetchone()
		src_id = res and res[0]
	log.info('%s #%s linked as source #%s of #%s', entity, se_id, src_id, feid_id)
	return { 'id': se_id, 'source_id': src_id }

def delete(user_id: int, event_id: int, entity: str):
	assert entity in ALL_TABLES
	with pool.connection() as conn:
		query = SQL('DELETE FROM events.{} WHERE id = %s').format(Identifier(entity))
		conn.execute(query, [event_id])
	log.info('user #%s deleted %s #%s', user_id, entity, event_id)

def create(user_id, entity, time, duration):
	assert entity in ALL_TABLES
	with pool.connection() as conn:
		query = SQL('INSERT INTO events.{} (time, duration) VALUES (%s, %s) RETURNING id').format(Identifier(entity))
		res = conn.execute(query, [time, duration]).fetchone()
		event_id = res and res[0]
	log.info('user #%s inserted %s #%s', user_id, entity, event_id)
	return event_id

def submit_changes(user_id, entities):
	with pool.connection() as conn:
		try:
			inserted_ids = {}
			for entity in EDITABLE_TABLES:
				if entity not in entities:
					continue

				for created in entities[entity]['created']:
					create_id = created['id']
					del created['id']
					if entity == 'feid_sources':
						for f in created:
							created[f] = inserted_ids.get(created[f], created[f])
					
					for f in list(created.keys()):
						if entity == 'feid' and created[f] is None:
							del created[f]

					cols = list(created.keys())

					cols_sql = SQL(',').join([Identifier(c) for c in cols])
					placeholders = SQL(',').join(Placeholder() * len(cols))
					query = SQL('INSERT INTO events.{} ({}) VALUES ({}) RETURNING id').format(Identifier(entities), cols_sql, placeholders)
					res = conn.execute(query, list(created.values())).fetchone()
					inserted_id = res and res[0]

					inserted_ids[create_id] = inserted_id

					conn.execute('INSERT INTO events.changes_log (author, event_id, entity_name, special) '+\
						'VALUES (%s,%s,%s,%s)', [user_id, inserted_id, entity, 'create'])
					log.info(f'Event created by user #{user_id}: {entity}#{inserted_id} {created.get('time', '')}')

				for deleted in entities[entity]['deleted']:
					query = SQL('DELETE FROM events.{} WHERE id = %s').format(Identifier(entity))
					conn.execute(query, [deleted])
					log.info(f'Event delted by user #{user_id}: {entity}#{deleted}')

				comp_cols = select_computed_columns(user_id)
				for change in entities[entity]['changes']:
					change_id, column, value, silent = [change.get(w) for w in ['id', 'column', 'value', 'silent']]
					target_id = inserted_ids.get(change_id, change_id)
					found_column = EDITABLE_TABLES[entity].get(column)
					found_column = found_column or next((c for c in comp_cols if c.sql_name == column), None)
					if not found_column :
						raise ValueError(f'Column not found: {column}')
					dtype = found_column.dtype
					new_value = value
					if value is not None:
						if dtype == 'time':
							new_value = datetime.strptime(value, '%Y-%m-%dT%H:%M:%S.000Z')
						if dtype == 'real':
							new_value = float(value) if value != 'auto' else None
						if dtype == 'integer':
							new_value = int(value) if value != 'auto' else None
						if dtype == 'enum' and value is not None and isinstance(found_column, Column) and found_column.enum and value not in found_column.enum:
							raise ValueError(f'Bad enum value for {found_column.name}: {value}')
					table = entity if isinstance(found_column, Column) else CC_TABLE
					id_col = 'id' if isinstance(found_column, Column) else 'feid_id'

					if change_id not in inserted_ids:
						query = SQL('SELECT {} FROM events.{} WHERE {} = %s').format(Identifier(column), Identifier(table), Identifier(id_col))
						res = conn.execute(query, [target_id]).fetchone()
						if not res or target_id in entities[entity]['deleted']:
							raise ValueError(f'Record not found: {table} #{target_id}')
						old_value = res[0]
					else:
						old_value = None

					query = SQL('UPDATE events.{} SET {} = %s WHERE {} = %s').format(Identifier(table), Identifier(column), Identifier(id_col))
					conn.execute(query, [new_value, target_id])

					if silent:
						continue

					new_value_str = 'auto' if new_value is None and value == 'auto' else new_value
					old_str, new_str = [v if v is None else
						v.replace(tzinfo=timezone.utc).timestamp() if dtype == 'time'
						else str(v) for v in [old_value, new_value_str]]

					conn.execute('INSERT INTO events.changes_log (author, event_id, entity_name, column_name, old_value, new_value) '+\
						'VALUES (%s,%s,%s,%s,%s,%s)', [user_id, target_id, entity, column, old_str, new_str])
					log.info(f'Change by user #{user_id}: {entity}#{target_id} {column} {old_value} -> {new_value_str}')
		except Exception as e:
			conn.rollback()
			log.info(f'Bad changes by user #%s, rolling back', user_id)
			raise e
