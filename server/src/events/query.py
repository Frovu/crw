from datetime import datetime, timezone
from database import pool, log
from psycopg.sql import SQL, Identifier

from events.table_structure import ALL_TABLES, E_FEID, EDITABLE_TABLES, FEID, FEID_SOURCE, SOURCE_CH, SOURCE_ERUPT, SELECT_FEID
from events.columns.computed_column import select_computed_columns, DATA_TABLE as CC_TABLE
from events.columns.series import SERIES

def render_table_structure(uid: int):
	structure = {
		table: { col.name: col.as_dict() for col in columns } for table, columns in ALL_TABLES.items()
	}
	for col in select_computed_columns(uid):
		structure[E_FEID][col.name] = col.as_dict()
		
	series = { ser.name: ser.as_dict() for ser in SERIES }
	return { 'tables': structure, 'series': series }

def select_events(entity: str, include: list[str]|None=None):
	if entity not in ALL_TABLES:
		raise NameError(f'Unknown entity: \'{entity}\'')
	
	cols = ALL_TABLES[entity]
	cols = cols if include is None else [c for c in cols if c.name in include]

	col_q = SQL(',').join([c.sql_val() for c in cols])
	time_col = next((c for c in cols if 'time' in c.sql_name), None)
	order = Identifier(time_col.sql_name if time_col else 'id')
	query = SQL('SELECT {} FROM events.{} ORDER BY {}').format(col_q, Identifier(entity), order)

	with pool.connection() as conn:
		data = conn.execute(query).fetchall()

	return { 'columns': [c.as_dict() for c in cols], 'data': data }

def select_feid(uid: int|None=None, include: list[str]|None=None, changelog=False):
	columns = [*FEID, *select_computed_columns(uid)]
	if include:
		columns = [c for c in columns if c.name in include]
	
	col_q = SQL(',').join([c.sql_val() for c in columns])
	select = SQL(f'SELECT {{}} FROM events.{E_FEID} '+\
		f'LEFT JOIN events.{CC_TABLE} ON id = feid_id ORDER BY time').format(col_q)

	with pool.connection() as conn:
		curs = conn.execute(select)
		rows, fields = curs.fetchall(), [desc[0] for desc in curs.description or []]
		resp = { 'fields': fields, 'data': rows }

		changes = None
		if changelog: # TODO: optimization
			changes = { 'fields': ['time', 'author', 'old', 'new', 'special'], 'events': {} }
			query = '''SELECT event_id, column_name, special, old_value, new_value,
				EXTRACT (EPOCH FROM changes_log.time)::integer,
				(select login from users where uid = author) as author
				FROM events.changes_log WHERE
					event_id is not null AND entity_name=\'feid\' AND column_name = ANY(%s)'''
			res = conn.execute(query, [[c.sql_name for c in columns]]).fetchall()
			per_event = changes['events']
			for eid, column, special, old_val, new_val, made_at, author in res:
				if eid not in per_event:
					per_event[eid] = {}
				if column not in per_event[eid]:
					per_event[eid][column] = []
				per_event[eid][column].append([made_at, author, old_val, new_val, special])
			
			resp['changelog'] = changes # type: ignore

	log.info('Table rendered for %s', (('user #'+str(uid)) if uid is not None else 'anon'))
	return resp

def link_source(feid_id, entity, existing_id = None):
	with pool.connection() as conn:
		assert entity in [SOURCE_CH[0], SOURCE_ERUPT[0]]
		se_id = existing_id or conn.execute(f'INSERT INTO events.{entity} '+\
			'DEFAULT VALUES RETURNING id').fetchone()[0]
		link_col = 'ch_id' if entity == SOURCE_CH[0] else 'erupt_id'
		src_id = conn.execute(f'INSERT INTO events.{FEID_SOURCE[0]} (feid_id, {link_col}) '+
			'VALUES (%s, %s) RETURNING id', [feid_id, se_id]).fetchone()[0]
	log.info('%s #%s linked as source #%s of #%s', entity, se_id, src_id, feid_id)
	return { 'id': se_id, 'source_id': src_id }

def delete(uid, eid, entity):
	assert entity in ALL_TABLES
	with pool.connection() as conn:
		conn.execute(f'DELETE FROM events.{entity} WHERE id = %s', [eid])
	log.info('user #%s deleted %s #%s', uid, entity, eid)

def create(uid, entity, time, duration):
	assert entity in ALL_TABLES
	with pool.connection() as conn:
		eid = conn.execute(f'INSERT INTO events.{entity} (time, duration) '+\
			' VALUES (%s, %s) RETURNING id', [time, duration]).fetchone()[0]
	log.info('user #%s inserted %s #%s', uid, entity, eid)
	return eid

def submit_changes(uid, entities):
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
					inserted_id = conn.execute(f'INSERT INTO events.{entity} ({",".join(cols)}) ' +\
						f'VALUES ({",".join(['%s' for c in cols])}) RETURNING id', list(created.values())).fetchone()[0]

					inserted_ids[create_id] = inserted_id

					conn.execute('INSERT INTO events.changes_log (author, event_id, entity_name, special) '+\
						'VALUES (%s,%s,%s,%s)', [uid, inserted_id, entity, 'create'])
					log.info(f'Event created by user #{uid}: {entity}#{inserted_id} {created.get('time', '')}')

				for deleted in entities[entity]['deleted']:
					conn.execute(f'DELETE FROM events.{entity} WHERE id = %s', [deleted])
					log.info(f'Event delted by user #{uid}: {entity}#{deleted}')

				for change in entities[entity]['changes']:
					change_id, column, value, silent = [change.get(w) for w in ['id', 'column', 'value', 'silent']]
					target_id = inserted_ids.get(change_id, change_id)
					found_column = EDITABLE_TABLES[entity].get(column)
					generics = not found_column and select_generics(uid)
					found_generic = generics and next((g for g in generics if g.name == column), False)
					if not found_column and not found_generic:
						raise ValueError(f'Column not found: {column}')
					if found_generic and found_generic.params.operation in G_DERIVED:
						raise ValueError(f'Can\'t edit derived generics ({found_generic.pretty_name})')
					dtype = found_column.data_type if found_column else found_generic.data_type
					new_value = value
					if value is not None:
						if dtype == 'time':
							new_value = datetime.strptime(value, '%Y-%m-%dT%H:%M:%S.000Z')
						if dtype == 'real':
							new_value = float(value) if value != 'auto' else None
						if dtype == 'integer':
							new_value = int(value) if value != 'auto' else None
						if dtype == 'enum' and value is not None and value not in found_column.enum:
							raise ValueError(f'Bad enum value for {found_column.pretty_name}: {value}')
					table = 'generic_data' if found_generic else entity
					id_col = 'feid_id' if found_generic else 'id'

					if change_id not in inserted_ids:
						res = conn.execute(f'SELECT {column} FROM events.{table} WHERE {id_col} = %s', [target_id]).fetchone()
						if not res or target_id in entities[entity]['deleted']:
							raise ValueError(f'Record not found: {table} #{target_id}')
						old_value = res[0]
					else:
						old_value = None

					conn.execute(f'UPDATE events.{table} SET {column} = %s WHERE {id_col} = %s', [new_value, target_id])

					if silent:
						continue

					new_value_str = 'auto' if new_value is None and value == 'auto' else new_value
					old_str, new_str = [v if v is None else
						v.replace(tzinfo=timezone.utc).timestamp() if dtype == 'time'
						else str(v) for v in [old_value, new_value_str]]

					conn.execute('INSERT INTO events.changes_log (author, event_id, entity_name, column_name, old_value, new_value) '+\
						'VALUES (%s,%s,%s,%s,%s,%s)', [uid, target_id, entity, column, old_str, new_str])
					log.info(f'Change by user #{uid}: {entity}#{target_id} {column} {old_value} -> {new_value_str}')
		except Exception as e:
			conn.rollback()
			log.info(f'Bad changes by user #%s, rolling back', uid)
			raise e
