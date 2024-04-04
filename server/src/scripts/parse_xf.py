import sys, os
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../'))
from datetime import datetime, timezone
from database import pool

PATH = 'tmp/XF_table.txt'

COLUMNS = {
	'magnitude': (26, 37), # !
	'dt': (37, 42),
	'dt1': (42, 47),
	'dt2': (47, 53),
	'gle': (145, 152),
	'psi': (106, 108),
	'p10': (109, 117),
	'p60': (117, 126),
	'p100': (126, 135),
	'dt_p10': (135, 139)
}

def parse_xf():
	data = []
	with open(PATH, encoding='cp1251') as f:
		for line in f:
			if 'Date,' in line:
				break

		slices = [slice(*c) for c in COLUMNS.values()]
		for line in f:
			if not line:
				continue
			y, m, d = line[:10].split('.')
			h, u, s = line[11:19].split(':')
			time = datetime(*[int(a) for a in [y, m, d, h, u, s]], tzinfo=timezone.utc)
			values = [float(line[s].strip()) if line[s].strip() else None for s in slices]
			# xm !!!
			values[0] *= 1e6

			data.append([*values, time])

	q = 'UPDATE events.solar_flares SET ' + ','.join([c + ' = %s' for c in [*COLUMNS.keys()]]) + ' WHERE time = %s'
	with pool.connection() as conn:
		conn.cursor().executemany(q, data)

if __name__ == '__main__':
	parse_xf()