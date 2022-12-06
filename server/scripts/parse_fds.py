from datetime import datetime, timezone
import sys, os
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../core'))
from database import pg_conn, tables_info

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

# (A|B|C|M|X) ([\d\.]+) replace $1$2 
# (\d)-\d9\d+ replace $1 -9900
if __name__ == '__main__':
	parse_whole_file('data/FDs_fulltable.txt')
	print(f'commit? [y/n]')
	if input() == 'y':
		pg_conn.commit()


'''
DELETE FROM forbush_effects;
DELETE FROM solar_sources;
DELETE FROM coronal_mass_ejections;
DELETE FROM coronal_holes;
DELETE FROM solar_flares;
DELETE FROM magnetic_clouds;
'''