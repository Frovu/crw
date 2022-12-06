from datetime import datetime, timezone
import sys, os
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../core'))
from database import pg_conn, tables_info

def _parse_value(value, description):
	col_type = description.get('type') or 'real'
	if parse_val := description.get('parse_value'):
		value = parse_val.get(value)
	if stub := description.get('parse_stub') and value == stub:
		return None
	if col_type == 'time':
		date, time = split[columns.index(col.replace('Time', 'Date'))], value
		if not '.' in date or not ':' in time: return None
		return datetime(*[int(i) for i in date.split('.')+time.split(':')], tzinfo=timezone.utc)
	if col_type in ['text', 'enum']:
		return value
	assert col_type in ['integer', 'real']
	try:
		return int(value) if col_type == 'integer' else float(value)
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
		for line in file:
			split, inserted_ids = line.split(), dict()
			for table, columns_desc in tables_info.items()[::-1]:
				values = list()
				for col_name, col_desc in columns_desc.items():
					if references := col_desc.get('references'):
						val = inserted_ids.get(references)
					else:
						if parse_name := col_desc.get('parse_name'):
							val = _parse_value(split[columns_order.index()], description)
					values.append(val)
				if any(values):
					count[table] += 1
					query = f'INSERT INTO {table} VALUES ({",".join(["%s" for c in columns_desc])})'
					cursor.execute(query, values)
		for table, cnt in count.items():
			print(f'[{cnt}] -> {table}')
		pg_conn.commit()

if __name__ == '__main__':
	columns = list_columns()
	result = parse_whole_file('data/FDs_fulltable.txt', columns)
	print(f'Parsed {len(result)} lines, insert? [y/n]')
	if input() == 'y':
		insert_parsed(columns, result)
		print('done')