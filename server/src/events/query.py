from datetime import datetime, timezone
from database import pool, log
from events.table_structure import FEID, FEID_SOURCE, SOURCE_CH, SOURCE_ERUPT, SELECT_FEID
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
	FEID[0]: list(FEID[1].values()),
	SOURCE_CH[0]: list(SOURCE_CH[1].values()),
	SOURCE_ERUPT[0]: list(SOURCE_ERUPT[1].values())
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
			'name': g.pretty_name or g.name,
			'type': g.data_type,
			'description': g.desc,
			'isComputed': True,
			'entity': 'feid',
			'generic': g.as_dict(uid),
			'rel': g.rel
		}
	series = { ser: G_SERIES[ser][2] for ser in G_SERIES }
	return { 'tables': info, 'series': series }

def select_events(entity):
	if entity not in TABLES:
		raise ValueError('Unknown entity: '+entity)
	cols = TABLES[entity]
	with pool.connection() as conn:
		cl = ','.join(f'EXTRACT(EPOCH FROM {c.name})::integer' if c.data_type == 'time' else c.name for c in cols)
		time_col = next((c for c in cols if 'time' in c.name)).name
		data = conn.execute(f'SELECT {cl} FROM events.{entity} ORDER BY {time_col}').fetchall()
	return { 'columns': [c.as_dict() for c in cols], 'data': data }

def select_feid(uid=None, changelog=False):
	generics = select_generics(uid)
	columns = []
	for col in list(FEID[1].values()) + generics:
		value = f'EXTRACT(EPOCH FROM {col.name})::integer' if col.data_type == 'time' else col.name
		columns.append(f'{value} as {col.name}')
	select_query = f'SELECT {", ".join(columns)} FROM {SELECT_FEID} ORDER BY time'
	with pool.connection() as conn:
		curs = conn.execute(select_query)
		rows, fields = curs.fetchall(), [desc[0] for desc in curs.description]
		if changelog:
			changes = { 'fields': ['time', 'author', 'old', 'new', 'special'], 'events': {} }
			query = '''SELECT event_id, column_name, special, old_value, new_value,
				EXTRACT (EPOCH FROM changes_log.time)::integer,
				(select login from users where uid = author) as author
				FROM events.changes_log WHERE
					event_id is not null AND entity_name=\'feid\' AND
					(column_name NOT LIKE \'g\\_\\_%%\' OR column_name = ANY(%s))'''
			res = conn.execute(query, [[g.name for g in generics]]).fetchall()
			per_event = changes['events']
			for eid, column, special, old_val, new_val, made_at, author in res:
				if eid not in per_event:
					per_event[eid] = {}
				if column not in per_event[eid]:
					per_event[eid][column] = []
				per_event[eid][column].append([made_at, author, old_val, new_val, special])
		log.info('Table rendered for %s', (('user #'+str(uid)) if uid is not None else 'anon'))
		return rows, fields, changes if changelog else None

def submit_changes(uid, changes):
	with pool.connection() as conn:
		for change in changes:
			target_id, entity, column, value = [change.get(w) for w in ['id', 'entity', 'column', 'value']]
			if entity not in TABLES:
				raise ValueError(f'Unknown entity: {entity}')
			found_column = TABLES[entity].get(column)
			generics = not found_column and select_generics(uid)
			found_generic = generics and next((g for g in generics if g.name == column), False)
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
			table = 'generic_data' if found_generic else entity
			id_col = 'feid_id' if found_generic else 'id'
			res = conn.execute(f'SELECT {column} FROM events.{table} WHERE {id_col} = %s', [target_id]).fetchone()
			if not res:
				raise ValueError('Target event not found')
			old_value = res[0]
			if value == old_value:
				raise ValueError(f'Value did not change: {old_value} == {value}')
			conn.execute(f'UPDATE events.{table} SET {column} = %s WHERE {id_col} = %s', [new_value, target_id])
			new_value_str = 'auto' if new_value is None and value == 'auto' else new_value
			old_str, new_str = [v.replace(tzinfo=timezone.utc).timestamp() if dtype == 'time'
				else (v if v is None else str(v)) for v in [old_value, new_value_str]]
			conn.execute('INSERT INTO events.changes_log (author, event_id, entity_name, column_name, old_value, new_value) '+\
				'VALUES (%s,%s,%s,%s,%s,%s)', [uid, target_id, entity, column, old_str, new_str])
			log.info(f'Change authored by user ({uid}): {entity}.{column} {old_value} -> {new_value_str}')