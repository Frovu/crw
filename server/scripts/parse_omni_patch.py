import sys, os, re
from datetime import datetime, timedelta
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../'))
from core.database import upsert_many
from data_series.omni.database import column_names

STUB_VALUES = ['9999.']

def parse_w0(path):
	data = []
	with open(path) as file:
		for line in file:
			if re.search('^[\d\.\s]+$', line):
				break
		while line:
			split = line.split()
			date = datetime(*[int(a) for a in split[12:][::-1]])
			values = split[:12] + next(file).split()
			for i in range(24):
				value = float(values[i]) if values[i] not in STUB_VALUES else None
				data.append((date + timedelta(hours=i), value))
			line = next(file, None)
	return data

if __name__ == '__main__':
	path = input('File path: ') if len(sys.argv) < 2 else sys.argv[1]
	if len(sys.argv) < 3:
		print('Variables available:\n', ', '.join(column_names))
	target = input('Variable: ') if len(sys.argv) < 3 else sys.argv[2]
	if not target in column_names:
		print('Invalid name')
	data = parse_w0(path)
	print(f'\nUpserting {target} [{len(data)}] from', data[0][0])
	upsert_many('omni', ['time', target], data)
	print('Done!')