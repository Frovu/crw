from datetime import datetime, timezone
import sys, os, re, psycopg, logging
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../'))
from core.database import pool, tables_info, upsert_many

log = logging.getLogger('aides')
log.setLevel('DEBUG')

FNAME = 'data/FDs_fulltable.txt'

format_fixes = [
	(r'(A|B|C|M|X) ([\d\.]+)', r'\1\2'),
	(r'(\d)-\d9\d+', r'\1 -9900'),
	(r'(:\d\d:\d\d)([.\d-]+)', r'\1 \2')
]
def fix_format(line):
	for exp, repl in format_fixes:
		line = re.sub(exp, repl, line)
	return line

def _parse_value(split, columns, col, description):
	value = split[columns.index(col)]
	col_type = description.get('type', 'real')
	if parse_val := description.get('parse_value'):
		value = parse_val.get(value)
	stub = description.get('parse_stub')
	if stub and value == stub:
		return None
	if col_type == 'time':
		date, time = split[columns.index(col.replace('Time', 'Date'))], value
		if not '.' in date or not ':' in time: return None
		return datetime(*[int(i) for i in date.split('.')+time.split(':')], tzinfo=timezone.utc)
	if col_type in ['text', 'enum']:
		return value
	assert col_type in ['integer', 'real']
	try:
		value = float(value)
		return value if stub or value > 0 else None
	except:
		return None

# only for updating columns in existing rows
def parse_one_column(table: str, column: str, conn):
	first_table = list(tables_info)[0]
	time_col_desc = tables_info[first_table]['time']
	time_col_name = time_col_desc['parse_name']
	target_col_desc = tables_info[table][column]
	target_col_name = target_col_desc['parse_name']

	# fname, is_standalone = f'data/{target_col_name}_list.txt', False
	# if os.path.exists(fname):
	# 	is_standalone = True
	# else:
	fname = FNAME
	print('Reading', fname)

	with open(fname) as file:
		for line in file:
			# if is_standalone:
			# 	columns_order = [time_col_name, target_col_name]
			# 	break
			if not 'Date' in line: continue
			columns_order = line.strip().split()
			break
		def recursive_search(tbl, target, path):
			if tbl == target:
				return path
			for col_name, col_desc in tables_info[tbl].items():
				if col_name.startswith('_'):
					continue
				if ref := col_desc.get('references'):
					npath = f'(SELECT {col_name} FROM events.{tbl} WHERE id = {path})'
					found = recursive_search(ref, target, npath)
					if found: return found
		select_id = recursive_search(first_table, table, f'(SELECT id FROM events.{first_table} WHERE time = data.time)')
		data = []
		for line in file:
			line_split = fix_format(line).split()
			time = _parse_value(line_split, columns_order, time_col_name, time_col_desc)
			value = _parse_value(line_split, columns_order, target_col_name, target_col_desc)
			data.append((time, value))
		curs = conn.cursor()
		diff_q = f'SELECT data.time, {column}, data.val FROM (VALUES %s) AS data(time, val) INNER JOIN events.{table} ON id = {select_id} WHERE {column} IS NULL OR {column} != data.val'
		diff = curs.executemany(diff_q, data)
		if not len(diff):
			print('already up to date')
			return False
		query = f'UPDATE events.{table} SET {column} = data.val FROM (VALUES %s) AS data(time, val) WHERE id = {select_id}'
		print('\n' + query)
		if len(diff) > 30:
			print(f'...\n[{len(diff)-30}]\n...')
		for d in diff[-30:]:
			t, p, n = d
			print(t, p, '->', n)
		print(f'\nabout to change {len(diff)} rows')
		diff = curs.executemany(query, data)
		return True
		
# if target_columns contains field with Time, its corresponding Date column is parsed automatically
def parse_whole_file(conn, lines):
		for li, line in enumerate(lines):
			if not 'Date Time' in line: continue
			columns_order = line.strip().split()
			break
		else:
			log.debug('failed: columns desc not found')
			return
		count = dict([(k, 0) for k in tables_info])
		unique_constraints = {tbl: re.sub(r'UNIQUE\s*\(([a-zA-Z\,\s]+)\)', r'\1', tables_info[tbl].get('_constraint', '')) for tbl in tables_info}
		exists_count = 0
		for line in lines[li+1:]:
			try:
				split, inserted_ids = fix_format(line).split(), dict()
				table = list(tables_info)[0]
				time = _parse_value(split, columns_order, 'Time', {"type": "time"})
				exists = conn.execute(f'SELECT 1 FROM events.{table} WHERE time = %s', [time]).fetchone()
				if exists:
					exists_count += 1
					continue
				for table, columns_desc in list(tables_info.items())[::-1]:
					columns = [k for k in columns_desc if not k.startswith('_')]
					values = [None for c in columns]
					for i in range(len(columns)):
						col_desc = columns_desc[columns[i]]
						if references := col_desc.get('references'):
							values[i] = inserted_ids.get(references)
						elif parse_name := col_desc.get('parse_name'):
							values[i] = _parse_value(split, columns_order, parse_name, col_desc)
						
					nonnul = [columns[i] for i in range(len(columns)) if values[i] is None and columns_desc[columns[i]].get('not_null')]
					if any(values):
						if len(nonnul):
							log.debug(f'not null violation ({nonnul[0]}), discarding ({table})')
							continue
						constraint = unique_constraints[table]
						a_column = constraint.split(',')[0]
						query = f'INSERT INTO events.{table}({",".join(columns)}) VALUES ({",".join(["%s" for c in columns])}) ' +\
							(f' ON CONFLICT ({constraint}) DO UPDATE SET {a_column}=EXCLUDED.{a_column}' if constraint else '') + ' RETURNING id'
						inserted = conn.execute(query, values).fetchone()
						if inserted is not None:
							count[table] += 1
							inserted_ids[table] = inserted[0]
			except Exception as e:
				log.debug(f'{split[:2]} {type(e)} {e}')
				log.debug(line)
				conn.rollback()
				return

		log.debug(f'{exists_count} found')
		for table, cnt in count.items():
			log.debug(f'[{cnt}] -> {table}')
		return count['forbush_effects']

def main():
	with pool.connection() as conn:
		if len(sys.argv) < 2:
			if input(f'parse whole FDs file? [y/n]: ') != 'y':
				return
			with open(FNAME) as file:
				parse_whole_file(conn, file.readlines())
			if input(f'commit insertion? [y/n]: ') == 'y':
				conn.commit()
			return

		name_part = sys.argv[1].lower()
		candidates = list()
		for table, table_info in tables_info.items():
			for col_name, col_desc in table_info.items():
				if col_name.startswith('_'): continue
				if not col_desc.get('parse_name'): continue
				if name_part in col_name or name_part in col_desc.get('name', '').lower() or name_part in col_desc.get('parse_name', '').lower():
					candidates.append((table, col_name))
		if len(candidates) < 1:
			return print(f'column not found: {name_part}')
		elif len(candidates) == 1:
			res = parse_one_column(*candidates[0], conn)
		else:
			print(f'found {len(candidates)} candidates:')
			print('\n'.join([f'  {i}. {t}.{c}' for i, (t, c) in enumerate(candidates)]))
			choice = input(f'please input which column to parse [0-{len(candidates)-1}]: ')
			assert int(choice) >= 0 and int(choice) < len(candidates)
			res = parse_one_column(*candidates[int(choice)], conn)
		if res and input(f'commit updates? [y/n]: ') == 'y':
			conn.commit()

if __name__ == '__main__':
	main()

'''
DROP TABLE IF EXISTS events.magnetic_clouds CASCADE;
DROP TABLE IF EXISTS events.solar_flares CASCADE;
DROP TABLE IF EXISTS events.coronal_holes CASCADE;
DROP TABLE IF EXISTS events.forbush_effects CASCADE;
DROP TABLE IF EXISTS events.coronal_mass_ejections CASCADE;
DROP TABLE IF EXISTS events.solar_sources CASCADE;
'''