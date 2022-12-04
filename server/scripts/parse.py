from datetime import datetime, timezone
import sys, os
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../core'))
from database import list_columns, get_column_type, get_short_name, insert_parsed

# if target_columns contains field with Time, its corresponding Date column is parsed autoamtically
def parse_whole_file(fname: str, target_columns: list):
	with open(fname) as file:
		for line in file:
			if not 'Date' in line: continue
			columns = line.strip().split()
			break
		result = []
		for line in file:
			split = line.split()
			def get_value(column):
				col = get_short_name(column)
				col_type = get_column_type(column)
				value = split[columns.index(col)]
				if value == 'None': return None
				if col_type == 'time':
					date, time = split[columns.index(col.replace('Time', 'Date'))], value
					if not '.' in date or not ':' in time: return None
					return datetime(*[int(i) for i in date.split('.')+time.split(':')], tzinfo=timezone.utc)
				try:
					return value if col_type == 'text' else float(value)
				except:
					return None
			data = [get_value(col) for col in target_columns]
			result.append(data)
	return result


if __name__ == '__main__':
	columns = list_columns()
	result = parse_whole_file('data/FDs_fulltable.txt', columns)
	print(f'Parsed {len(result)} lines, insert? [y/n]')
	if input() == 'y':
		insert_parsed(columns, result)
		print('done')