from datetime import datetime, timezone
import sys, os
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../core'))
from database import pg_conn, tables_info
import psycopg2.extras

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
def parse_one_column(fname: str, table: str, column: str):
	with open(fname) as file, pg_conn.cursor() as cursor:
		for line in file:
			if not 'Date' in line: continue
			columns_order = line.strip().split()
			break
		first_table = list(tables_info)[0]
		def recursive_search(tbl, target, path):
			if tbl == target:
				return path
			for col_name, col_desc in tables_info[tbl].items():
				if col_name.startswith('_'):
					continue
				if ref := col_desc.get('references'):
					npath = f'(SELECT {col_name} FROM {tbl} WHERE id = {path})'
					found = recursive_search(ref, target, npath)
					if found: return found
		select_id = recursive_search(first_table, table, f'(SELECT id FROM {first_table} WHERE time = data.time)')
		data = []
		time_col_desc = tables_info[first_table]['time']
		time_col_name = time_col_desc['parse_name']
		target_col_desc = tables_info[table][column]
		target_col_name = target_col_desc['parse_name']
		for line in file:
			line_split = line.split()
			time = _parse_value(line_split, columns_order, time_col_name, time_col_desc)
			value = _parse_value(line_split, columns_order, target_col_name, target_col_desc)
			data.append((time, value))
		diff_q = f'SELECT data.time, {column}, data.val FROM (VALUES %s) AS data(time, val) INNER JOIN {table} ON id = {select_id} WHERE {column} != data.val'
		psycopg2.extras.execute_values(cursor, diff_q, data, template='(%s, %s'+('::real' if target_col_desc.get('type', 'real') == 'real' else '')+')')
		diff = cursor.fetchall()
		if not len(diff):
			print('already up to date')
			return False
		query = f'UPDATE {table} SET {column} = data.val FROM (VALUES %s) AS data(time, val) WHERE id = {select_id}'
		print('\n' + query)
		if len(diff) > 30:
			print(f'...\n[{len(diff)-30}]\n...')
		for d in diff[-30:]:
			t, p, n = d
			print(t, p, '->', n)
		print(f'\nabout to change {len(diff)} rows')
		psycopg2.extras.execute_values(cursor, query, data)
		return True
		
# if target_columns contains field with Time, its corresponding Date column is parsed automatically
def parse_whole_file(fname: str):
	with open(fname) as file, pg_conn.cursor() as cursor:
		for line in file:
			if not 'Date' in line: continue
			columns_order = line.strip().split()
			break
		count = dict([(k, 0) for k in tables_info])
		exists_count = 0
		for line in file:
			split, inserted_ids = line.split(), dict()
			table = list(tables_info)[0]
			time = _parse_value(split, columns_order, 'Time', {"type": "time"})
			cursor.execute(f'SELECT 1 FROM {table} WHERE time = %s', [time])
			if exists := cursor.fetchone():
				exists_count += 1
				continue
			for table, columns_desc in list(tables_info.items())[::-1]:
				columns = [k for k in columns_desc if not k.startswith('_')]
				values = list()
				# print('\n', table)
				for col_name in columns:
					col_desc = columns_desc[col_name]
					val = None
					if references := col_desc.get('references'):
						val = inserted_ids.get(references)
					elif parse_name := col_desc.get('parse_name'):
						val = _parse_value(split, columns_order, parse_name, col_desc)
						# print(col_name, ":", split[columns_order.index(parse_name)], "->", val)
					values.append(val)
				if any(values):
					count[table] += 1
					query = f'INSERT INTO {table}({",".join(columns)}) VALUES ({",".join(["%s" for c in columns])}) RETURNING id'
					cursor.execute(query, values)
					inserted = cursor.fetchone()
					inserted_ids[table] = inserted and inserted[0]
		print(f'{exists_count} found')
		for table, cnt in count.items():
			print(f'[{cnt}] -> {table}')

def main():
	FNAME = 'data/FDs_fulltable.txt'
	if len(sys.argv) < 2:
		if input(f'parse whole FDs file? [y/n]: ') != 'y':
			return
		parse_whole_file(FNAME)
		if input(f'commit insertion? [y/n]: ') == 'y':
			pg_conn.commit()
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
		res = parse_one_column(FNAME, *candidates[0])
	else:
		print(f'found {len(candidates)} candidates:')
		print('\n'.join([f'  {i}. {t}.{c}' for i, (t, c) in enumerate(candidates)]))
		choice = input(f'please input which column to parse [0-{len(candidates)-1}]: ')
		assert int(choice) >= 0 and int(choice) < len(candidates)
		res = parse_one_column(FNAME, *candidates[int(choice)])
	if res and input(f'commit updates? [y/n]: ') == 'y':
		pg_conn.commit()


# (A|B|C|M|X) ([\d\.]+) replace $1$2 
# (\d)-\d9\d+ replace $1 -9900
if __name__ == '__main__':
	main()

'''
DELETE FROM forbush_effects;
DELETE FROM solar_sources;
DELETE FROM coronal_mass_ejections;
DELETE FROM coronal_holes;
DELETE FROM solar_flares;
DELETE FROM magnetic_clouds;
'''