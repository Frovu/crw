from dataclasses import asdict
from datetime import datetime, timezone
from database import pool, log
from events.table import table_columns, all_columns, select_from_root, column_id, ENTITY_SHORT
from events.generic_columns import select_generics
from events.generic_core import SERIES, G_DERIVED

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
			'id': g.name,
			'name': g.pretty_name,
			'type': g.data_type,
			'description': g.desc,
			'isComputed': True,
			'generic': {
				'id': g.id,
				'nickname': g.nickname,
				'description': g.description,
				'params': asdict(g.params),
				'is_public': g.is_public,
				'is_own': uid == g.owner
			}
		}
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
	with pool.connection() as conn:
		curs = conn.execute(select_query)
		rows, fields = curs.fetchall(), [desc[0] for desc in curs.description]
		if changelog:
			rendered = {}
			changes = []
			for entity in table_columns:
				query = f'''SELECT {root}.id as root_id, entity_name, column_name, special,
				(select login from users where uid = author) as author, EXTRACT (EPOCH FROM changes_log.time)::integer, old_value, new_value
					FROM events.changes_log LEFT JOIN {select_from_root[root]} ON {entity}.id = event_id AND entity_name = %s
					WHERE column_name NOT LIKE \'g\\_\\_%%\' OR column_name = ANY(%s)'''
				res = conn.execute(query, (entity, [g.name for g in generics])).fetchall()
				changes.extend(res)
			for root_id, entity, column, special, author, made_at, old_val, new_val in changes:
				if root_id not in rendered:
					rendered[root_id] = {}
				name = column if column.startswith('g__') else column_id(table_columns[entity][column])

				if column in table_columns[entity]:
					name = column_id(table_columns[entity][column])
				else:
					name = next((column_id(g) for g in generics if g.name == column), column)

				if name not in rendered[root_id]:
					rendered[root_id][name] = []
				# TODO: pack changelog in array matrix instead of objects to optimize payload size
				rendered[root_id][name].append({
					'special': special,
					'time': made_at,
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
			if found_generic and found_generic.type in G_DERIVED:
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