from datetime import datetime, timezone
from core.database import pool, log, table_columns, all_columns, select_from_root, ENTITY_SHORT
from core.generic_columns import select_generics, SERIES, DERIVED_TYPES

def column_id(col):
	return f'{ENTITY_SHORT[col.entity]}_{col.name}'

def render_table_info(uid):
	generics = select_generics(uid)
	info = {}
	for table, columns in table_columns.items():
		info[table] = {}
		for name, col in columns.items():
			info[table][name] = {
				'id': column_id(col),
				'parseName': col.parse_name,
				'parseValue': col.parse_value,
				'nullable': not col.not_null,
				'name': col.pretty_name or name,
				'type': col.dtype,
				'isComputed': col.computed
			}
			if col.enum:
				info[table][name]['enum'] = col.enum
			if col.description:
				info[table][name]['description'] = col.description
	for g in generics:
		info[g.entity][g.name] = {
			'id': column_id(g),
			'name': g.pretty_name,
			'type': 'real',
			'description': g.description,
			'isComputed': True,
			'generic': {
				'id': g.id,
				'entity': g.entity,
				'type': g.type,
				'series': g.series,
				'poi': g.poi,
				'shift': g.shift
			}
		}
		if uid in g.users:
			info[g.entity][g.name]['user_generic_id'] = g.id
	series = { ser: SERIES[ser][2] for ser in SERIES }
	return { 'tables': info, 'series': series }

def select_events(uid=None, root='forbush_effects', changelog=False):
	generics = select_generics(uid)
	columns = []
	for column in all_columns:
		col = f'{column.entity}.{column.name}'
		value = f'EXTRACT(EPOCH FROM {col})::integer' if column.dtype == 'time' else col
		columns.append(f'{value} as {column_id(column)}')
	for gen in generics:
		columns.append(f'{gen.entity}.{gen.name} as {column_id(gen)}')
	select_query = f'SELECT {root}.id as id,\n{", ".join(columns)}\nFROM {select_from_root[root]} ORDER BY ' +\
		f'{root}.time' if 'time' in table_columns[root] else f'{root}.id'
	print(select_query)
	with pool.connection() as conn:
		curs = conn.execute(select_query)
		rows, fields = curs.fetchall(), [desc[0] for desc in curs.description]
		if changelog:
			entity_selector = '\nOR '.join([f'(entity_name = \'{ent}\' AND {ent}.id = event_id)' for ent in table_columns])
			query = f'''SELECT (SELECT {root}.id FROM {select_from_root[root]} WHERE {entity_selector}) as root_id,
				entity_name, column_name, (select login from users where uid = author) as author, EXTRACT (EPOCH FROM time)::integer, old_value, new_value
				FROM events.changes_log WHERE column_name NOT LIKE \'g\\_\\_%%\' OR column_name = ANY(%s)
				ORDER BY root_id, column_name, time''' # this is cursed
			changes = conn.execute(query, ([g.name for g in generics],)).fetchall()
			rendered = {}
			for eid, ent, column, author, at, old_val, new_val in changes:
				if eid not in rendered:
					rendered[eid] = {}
				name = column if column.startswith('g__') else column_id(table_columns[ent][column])
				if column in table_columns[ent]:
					name = column_id(table_columns[ent][column])
				else:
					name = next((column_id(g) for g in generics if g.name == column), column)
				if name not in rendered[eid]:
					rendered[eid][name] = []
				rendered[eid][name].append({
					'time': at,
					'author': author,
					'old': old_val,
					'new': new_val
				})
		return rows, fields, rendered if changelog else None

def submit_changes(uid, changes, root='forbush_effects'):
	with pool.connection() as conn:
		for change in changes:
			root_id, entity, column, value = [change.get(w) for w in ['id', 'entity', 'column', 'value']]
			if entity not in table_columns:
				raise ValueError(f'Unknown entity: {entity}')
			found_column = table_columns[entity].get(column)
			generics = not found_column and select_generics(uid)
			found_generic = generics and next((g for g in generics if g.entity == entity and g.name == column), False)
			if not found_column and not found_generic:
				raise ValueError(f'Column not found: {column}')
			if found_generic and found_generic.type in DERIVED_TYPES:
				raise ValueError('Can\'t edit derived generics')
			dtype = found_column.dtype if found_column else found_generic.data_type
			new_value = value
			if value is not None:
				if dtype == 'time':
					new_value = datetime.strptime(value, '%Y-%m-%dT%H:%M:%S.000Z')
				if dtype == 'real':
					new_value = float(value) if value != 'auto' else None
				if dtype == 'integer':
					new_value = int(value) if value != 'auto' else None
				if dtype == 'enum' and value is not None and value not in found_column.get('enum'):
					raise ValueError(f'Bad enum value: {value}')
			res = conn.execute(f'SELECT {entity}.id, {entity}.{column} FROM {select_from_root[root]} WHERE {root}.id = %s', [root_id]).fetchone()
			if not res:
				raise ValueError('Target event not found')
			target_id, old_value = res
			if value == old_value:
				raise ValueError(f'Value did not change: {old_value} == {value}')
			conn.execute(f'UPDATE events.{entity} SET {column} = %s WHERE id = %s', [new_value, target_id])
			new_value_str = 'auto' if new_value is None and value == 'auto' else new_value
			old_str, new_str = [v.replace(tzinfo=timezone.utc).timestamp() if dtype == 'time' else (v if v is None else str(v)) for v in [old_value, new_value_str]]
			conn.execute('INSERT INTO events.changes_log (author, event_id, entity_name, column_name, old_value, new_value) VALUES (%s,%s,%s,%s,%s,%s)',
				[uid, target_id, entity, column, old_str, new_str])
			log.info(f'Change authored by user ({uid}): {entity}.{column} {old_value} -> {new_value_str}')