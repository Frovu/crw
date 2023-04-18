import json, os, logging
from psycopg_pool import ConnectionPool
from psycopg import sql
from datetime import datetime, timezone

log = logging.getLogger('aides')
pool = ConnectionPool(kwargs = {
	'dbname': 'cr_aid',
	'user': 'cr_aid',
	'password': os.environ.get('DB_PASSWORD'),
	'host': os.environ.get('DB_HOST')
})

dirname = os.path.dirname(__file__)
with open(os.path.join(dirname, '../config/tables.json')) as file:
	tables_info = json.load(file)
	tables_tree = dict()
	tables_refs = dict()
	for table in tables_info:
		for column, desc in tables_info[table].items():
			if column.startswith('_'): continue
			if ref := desc.get('references'):
				tables_tree[table] = (tables_tree.get(table) or []) + [ref]
				tables_refs[(table, ref)] = column
ENTITY_SHORT = {t: ''.join([a[0].lower() for a in t.split('_')]) for t in tables_info}

def enum_name(table, column):
	return f'enum_{table}_{column}'

def column_definition(table, name, desc):
	dtype = desc.get('type', 'real')
	if dtype == 'time':
		dtype = 'timestamp with time zone'
	if dtype == 'enum':
		dtype = 'text'
	if ref := desc.get("references"):
		dtype = f'integer REFERENCES events.{ref} ON DELETE SET NULL'
	if desc.get("not_null"):
		dtype += " NOT NULL"
	if desc.get("enum"):
		dtype += f' REFERENCES events.{enum_name(table, name)} ON UPDATE CASCADE'
	return f'{name} {dtype}'

with pool.connection() as conn:
	conn.execute('CREATE SCHEMA IF NOT EXISTS events')
	for table, table_desc in list(tables_info.items())[::-1]:
		columns = [k for k in table_desc if not k.startswith('_')]
		for column in columns:
			desc = table_desc[column]
			if enum := desc.get('enum'):
				conn.execute(f'CREATE TABLE IF NOT EXISTS events.{enum_name(table, column)} (value TEXT PRIMARY KEY)')
				conn.execute(f'INSERT INTO events.{enum_name(table, column)} VALUES {",".join(["(%s)" for i in enum])} ON CONFLICT DO NOTHING', enum)
			column_def = column_definition(table, column, desc)
			conn.execute(f'ALTER TABLE IF EXISTS events.{table} ADD COLUMN IF NOT EXISTS {column_def}')
		create_columns = ',\n\t'.join(['id SERIAL PRIMARY KEY'] + [column_definition(table, c, table_desc[c]) for c in columns])
		constraint = table_desc.get('_constraint')
		create_table = f'CREATE TABLE IF NOT EXISTS events.{table} (\n\t{create_columns}\n{(","+constraint) if constraint else ""})'
		conn.execute(create_table)
	conn.execute('''CREATE TABLE IF NOT EXISTS events.changes_log (
		id SERIAL PRIMARY KEY,
		author integer references users on delete set null,
		time timestamptz not null default CURRENT_TIMESTAMP,
		event_id integer,
		entity_name text,
		column_name text,
		old_value text,
		new_value text)''')

def get_joins_path(src, dst):
	if src == dst: return ''
	joins = ''
	def rec_find(a, b, path=[src], direction=[1]):
		if a == b: return path, direction
		lst = tables_tree.get(a)
		for ent in lst or []:
			if ent in path: continue
			if p := rec_find(ent, b, path + [ent], direction+[1]):
				return p
		upper = next((t for t in tables_tree if a in tables_tree[t]), None)
		if not upper or upper in path: return None
		return rec_find(upper, b, path + [upper], direction+[-1])
	found = rec_find(src, dst)
	if not found:
		raise ValueError('No path to entity')
	path, direction = found
	links = [[path[i], path[i+1], direction[i+1]] for i in range(len(path)-1)]
	for a, b, direction in links:
		master, slave = (a, b)[::direction]
		joins += f'LEFT JOIN events.{b} ON {slave}.id = {master}.{tables_refs.get((master, slave))}\n'
	return joins

def upsert_many(table, columns, data, constants=[], conflict_constant='time', do_nothing=False):
	with pool.connection() as conn, conn.cursor() as cur, conn.transaction():
		cur.execute(f'CREATE TEMP TABLE tmp (LIKE {table} INCLUDING DEFAULTS) ON COMMIT DROP')
		for c, z in zip(columns, constants):
			cur.execute(f'ALTER TABLE tmp DROP COLUMN {c}')
		with cur.copy(f'COPY tmp({",".join(columns[len(constants):])}) FROM STDIN') as copy:
			for row in data:
				copy.write_row(row)
		placeholders = ','.join(['%s' for c in constants]) + ',' if constants else ''
		cur.execute(f'INSERT INTO {table}({",".join(columns)}) SELECT {placeholders}{",".join(columns[len(constants):])} FROM tmp ' +
			('ON CONFLICT DO NOTHING' if do_nothing else
			f'ON CONFLICT ({conflict_constant}) DO UPDATE SET ' + ','.join([f'{c} = COALESCE(EXCLUDED.{c}, {table}.{c})' for c in columns if c not in conflict_constant])), constants)

from core.generic_columns import select_generics, SERIES, DERIVED_TYPES

def render_table_info(uid):
	generics = select_generics(uid)
	info = dict()
	for i, (table, table_info) in enumerate(tables_info.items()):
		info[table] = dict()
		for col, col_desc in table_info.items():
			if col.startswith('_') or col_desc.get('references'):
				continue
			tag = ENTITY_SHORT[table] + '_' + col
			info[table][tag] = {
				'name': col_desc.get('name', col),
				'type': col_desc.get('type', 'real'),
				'isComputed': col_desc.get('computed', 'generic' in col_desc)
			}
			if enum := col_desc.get('enum'):
				info[table][tag]['enum'] = enum
			if description := col_desc.get('description'):
				info[table][tag]['description'] = description
	for g in generics:
		name = ENTITY_SHORT[g.entity] + '_' + g.name
		info[g.entity][name] = {
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
			info[g.entity][name]['user_generic_id'] = g.id
	series = { ser: SERIES[ser][2] for ser in SERIES }
	return { 'tables': info, 'series': series }

def select_events(uid=None, root='forbush_effects', changelog=False):
	generics = select_generics(uid)
	columns, joins = [], ''
	for table in tables_info:
		for column, desc in tables_info[table].items():
			if column.startswith('_'):
				continue
			if ref := desc.get('references'):
				joins += f'LEFT JOIN events.{ref} ON {ref}.id = {table}.{column}\n'
			else:
				col = f'{table}.{column}'
				value = f'EXTRACT(EPOCH FROM {col})::integer' if desc.get('type') == 'time' else col
				name = f'{ENTITY_SHORT[table]}_{column}'
				columns.append(f'{value} as {name}')
	for g in generics:
		name = f'{ENTITY_SHORT[g.entity]}_{g.name}'
		columns.append(f'{g.entity}.{g.name} as {name}')
	select_query = f'SELECT {root}.id as id,\n{", ".join(columns)}\nFROM events.{root}\n{joins}'
	with pool.connection() as conn:
		curs = conn.execute(select_query + f' ORDER BY {root}.id')
		rows, fields = curs.fetchall(), [desc[0] for desc in curs.description]
		if changelog:
			entity_selector = '\nOR '.join([f'(entity_name = \'{ent}\' AND {ent}.id = event_id)' for ent in tables_info])
			query = f'''SELECT (SELECT {root}.id FROM events.{root} {joins} WHERE {entity_selector}) as root_id,
				entity_name, column_name, (select login from users where uid = author) as author, EXTRACT (EPOCH FROM time)::integer, old_value, new_value
				FROM events.changes_log WHERE column_name NOT LIKE \'g\\_\\_%%\' OR column_name = ANY(%s)
				ORDER BY root_id, column_name, time''' # this is cursed
			changes = conn.execute(query, ([g.name for g in generics],)).fetchall()
			rendered = dict()
			for eid, ent, column, author, at, old_val, new_val in changes:
				if eid not in rendered:
					rendered[eid] = dict()
				name = f'{ENTITY_SHORT[ent]}_{column}'
				if name not in rendered[eid]:
					rendered[eid][name] = list()
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
			if entity not in tables_info:
				raise ValueError(f'Unknown entity: {entity}')
			if column and column.startswith(ENTITY_SHORT[entity]):
				column = column[len(ENTITY_SHORT[entity])+1:]
			found_column = tables_info[entity].get(column)
			generics = not found_column and select_generics(uid)
			found_generic = generics and next((g for g in generics if g.entity == entity and g.name == column), False)
			if not found_column and not found_generic:
				raise ValueError(f'Column not found: {column}')
			if found_generic and found_generic.type in DERIVED_TYPES:
				raise ValueError('Can\'t edit derived generics')
			dtype = found_column.get('type', 'real') if found_column else found_generic.data_type
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
			joins = get_joins_path(root, entity)
			res = conn.execute(f'SELECT {entity}.id, {entity}.{column} FROM events.{root} {joins} WHERE {root}.id = %s', [root_id]).fetchone()
			if not res:
				raise ValueError(f'Target event not found')
			target_id, old_value = res
			if value == old_value:
				raise ValueError(f'Value did not change: {old_value} == {value}')
			conn.execute(f'UPDATE events.{entity} SET {column} = %s WHERE id = %s', [new_value, target_id])
			new_value_str = 'auto' if new_value is None and value == 'auto' else new_value
			old_str, new_str = [v.replace(tzinfo=timezone.utc).timestamp() if dtype == 'time' else (v if v is None else str(v)) for v in [old_value, new_value_str]]
			conn.execute('INSERT INTO events.changes_log (author, event_id, entity_name, column_name, old_value, new_value) VALUES (%s,%s,%s,%s,%s,%s)',
				[uid, target_id, entity, column, old_str, new_str])
			log.info(f'Change authored by user ({uid}): {entity}.{column} {old_value} -> {new_value_str}')
			