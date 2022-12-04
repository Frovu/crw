from datetime import datetime, timezone
import sys, os
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../core'))
from database import list_columns, get_column_type, get_short_name

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
			def get_datetime(column):
				date, time = split[columns.index(column.replace('Time', 'Date'))], split[columns.index(column)]
				if not '.' in date or not ':' in time:
					return None
				return datetime(*[int(i) for i in date.split('.')+time.split(':')], tzinfo=timezone.utc)
			def get_value(column):
				value = split[columns.index(column)]
				if value == 'None': return None
				try:
					return value if column in ['Source', 'Fdata'] else float(value)
				except:
					return None
			target = [get_short_name(col) for col in ['time'] + target_columns]
			data = [get_datetime(c) if 'Time' in c else get_value(c) for c in target]
			result.append(data)
	return result


if __name__ == '__main__':
	result = parse_whole_file('data/FDs_fulltable.txt', list_columns())
	for i in result[-20:]:
		print('    '.join([str(a) for a in i]))