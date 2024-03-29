import sys, os
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../'))
from datetime import datetime, timezone
from database import pool

PATH = 'tmp/XF_table.txt'

COLUMNS = {
	'gle': 'GLE',
	'psi': 'psi',
	'p10': 'p>10',
	'p60': 'p>60',
	'p100': 'p>100',
	'dt_p10': 'dtp10'
}

def parse_xf():
	data = []
	with open(PATH, encoding='cp1251') as f:
		for line in f:
			if 'Date,' in line:
				columns = [b for a in line.split(',') for b in (['XI', 'XMp'] if a.strip() == 'XIMp' else a.strip().split())]
				break

		index = [columns.index(c) for c in COLUMNS.values()]
		for line in f:
			y, m, d = line[:10].split('.')
			h, u, s = line[11:19].split(':')
			split = line[90:].split()
			time = datetime(*[int(a) for a in [y, m, d, h, u, s]], tzinfo=timezone.utc)
			values = [float(split[i-12]) for i in index]
			data.append([*values, time])

	q = 'UPDATE events.solar_flares SET ' + ','.join([c + ' = %s' for c in [*COLUMNS.keys()]]) + ' WHERE time = %s'
	with pool.connection() as conn:
		conn.cursor().executemany(q, data)
	# upsert_many('events.solar_flares', ['time', *COLUMNS.keys()], data)

if __name__ == '__main__':
	parse_xf()