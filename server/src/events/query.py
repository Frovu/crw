from datetime import datetime, timezone
from database import pool, log
from events.table_structure import FEID, FEID_SOURCE, SOURCE_CH, SOURCE_ERUPT
from events.generic_columns import select_generics
from events.generic_core import G_SERIES, G_DERIVED
from events.source import donki, lasco_cme, r_c_icme, solardemon, solarsoft

TABLES = {
	donki.FLR_TABLE: donki.FLR_COLS,
	donki.CME_TABLE: donki.CME_COLS,
	lasco_cme.TABLE: lasco_cme.COLS,
	r_c_icme.TABLE: r_c_icme.COLS,
	solardemon.DIM_TABLE: solardemon.DIM_COLS,
	solardemon.FLR_TABLE: solardemon.FLR_COLS,
	solarsoft.TABLE: solarsoft.COLS,
	FEID[0]: FEID[1],
	SOURCE_CH[0]: SOURCE_CH[1],
	SOURCE_ERUPT[0]: SOURCE_ERUPT[1]
}

def render_table_info(uid):
	generics = select_generics(uid)
	info = {}
	for tbl in [FEID, FEID_SOURCE, SOURCE_CH, SOURCE_ERUPT]:
		table, columns = tbl
		info[table] = { name: col.as_dict() for name, col in columns.items() }
	for g in generics:
		info['feid'][g.name] = {
			'id': g.name,
			'name': g.pretty_name,
			'type': g.data_type,
			'description': g.desc,
			'isComputed': True,
			'generic': g.as_dict(uid)
		}
	series = { ser: G_SERIES[ser][2] for ser in G_SERIES }
	return { 'tables': info, 'series': series }

def select_catalogue(entity):
	if entity not in TABLES:
		raise ValueError('Unknown entity: '+entity)
	cols = TABLES[entity]
	with pool.connection() as conn:
		cl = ','.join(f'EXTRACT(EPOCH FROM {c.name})::integer' if c.data_type == 'time' else c.name for c in cols)
		time_col = next((c for c in cols if 'time' in c.name)).name
		data = conn.execute(f'SELECT {cl} FROM events.{entity} ORDER BY {time_col}').fetchall()
	return { 'columns': [c.as_dict() for c in cols], 'data': data }

def select_events(uid=None, changelog=False):
	generics = select_generics(uid)
	columns = []
	for col in FEID[1].values().concat(generics):
		sel = f'feid.{col.name}'
		value = f'EXTRACT(EPOCH FROM {sel})::integer' if col.data_type == 'time' else col
		columns.append(f'{value} as {col.name}')
	select_query = f'SELECT {", ".join(columns)} FROM events.feid ORDER BY time'
	with pool.connection() as conn:
		curs = conn.execute(select_query)
		rows, fields = curs.fetchall(), [desc[0] for desc in curs.description]
		if changelog:
			rendered = {}
			# changes = []
			# for entity in table_columns:
			# 	query = f'''SELECT {root}.id as root_id, entity_name, column_name, special,
			# 	(select login from users where uid = author) as author, EXTRACT (EPOCH FROM changes_log.time)::integer, old_value, new_value
			# 		FROM events.changes_log LEFT JOIN {select_from_root[root]} ON {entity}.id = event_id AND entity_name = %s
			# 		WHERE {root}.id is not null AND (column_name NOT LIKE \'g\\_\\_%%\' OR column_name = ANY(%s))'''
			# 	res = conn.execute(query, (entity, [g.name for g in generics])).fetchall()
			# 	changes.extend(res)
			# for root_id, entity, column, special, author, made_at, old_val, new_val in changes:
			# 	if root_id not in rendered:
			# 		rendered[root_id] = {}

			# 	name = column_id(table_columns[entity][column]) if column in table_columns[entity] else column

			# 	if name not in rendered[root_id]:
			# 		rendered[root_id][name] = []
			# 	# TODO: pack changelog in array matrix instead of objects to optimize payload size
			# 	rendered[root_id][name].append({
			# 		'special': special,
			# 		'time': made_at,
			# 		'author': author,
			# 		'old': old_val,
			# 		'new': new_val
			# 	})
		log.info('Table rendered for %s', (('user #'+str(uid)) if uid is not None else 'anon'))
		return rows, fields, rendered if changelog else None

def submit_changes(uid, changes, root='forbush_effects'):
	with pool.connection() as conn:
		for change in changes: # TODO: use column id like fe_something
			target_id, entity, column, value = [change.get(w) for w in ['id', 'entity', 'column', 'value']]
			if entity not in TABLES:
				raise ValueError(f'Unknown entity: {entity}')
			found_column = TABLES[entity].get(column)
			generics = not found_column and select_generics(uid)
			found_generic = generics and next((g for g in generics if g.entity == entity and g.name == column), False)
			if not found_column and not found_generic:
				raise ValueError(f'Column not found: {column}')
			if found_generic and found_generic.params.operation in G_DERIVED:
				raise ValueError('Can\'t edit derived generics')
			dtype = found_column.data_type if found_column else found_generic.data_type
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
			res = conn.execute(f'SELECT {column} FROM events.{entity} WHERE {root}.id = %s', [target_id]).fetchone()
			if not res:
				raise ValueError('Target event not found')
			old_value = res[0]
			if value == old_value:
				raise ValueError(f'Value did not change: {old_value} == {value}')
			conn.execute(f'UPDATE events.{entity} SET {column} = %s WHERE id = %s', [new_value, target_id])
			new_value_str = 'auto' if new_value is None and value == 'auto' else new_value
			old_str, new_str = [v.replace(tzinfo=timezone.utc).timestamp() if dtype == 'time'
				else (v if v is None else str(v)) for v in [old_value, new_value_str]]
			conn.execute('INSERT INTO events.changes_log (author, event_id, entity_name, column_name, old_value, new_value) '+\
				'VALUES (%s,%s,%s,%s,%s,%s)', [uid, target_id, entity, column, old_str, new_str])
			log.info(f'Change authored by user ({uid}): {entity}.{column} {old_value} -> {new_value_str}')