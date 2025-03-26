import sys, os
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../'))
from datetime import datetime, timezone, timedelta
from database import upsert_many
from events.source.noaa_flares import TABLE, COLS

PATH = 'tmp/XF_table.txt'

COLUMNS = {
	'flux': slice(26, 37), # !
	'dt': slice(37, 42),
	'dt1': slice(42, 47),
	'lat': slice(90, 94),
	'lon': slice(95, 100),
	'psi': slice(106, 108),
	'p10': slice(116, 124),
	'p60': slice(124, 133),
	'p100': slice(133, 142),
	'dt_p10': slice(142, 146),
	'gle': slice(153, 159),
	'active_region': slice(190, 196),
}

def parse_xf():
	columns = [c.name for c in COLS]
	data = []
	with open(PATH, encoding='cp1251') as f:
		print('file open')
		for line in f:
			if 'Date,' in line:
				break

		prevtime = None
		for line in f:
			if not line:
				continue
			y, m, d = line[:10].split('.')
			h, u, s = line[11:19].split(':')
			time = datetime(*[int(a) for a in [y, m, d, h, u, s]], tzinfo=timezone.utc)
			if time == prevtime:
				data.pop()
			prevtime = time
			values = { col: float(line[s].strip()) if line[s].strip() and line[s].strip() != '-1' else None for col, s in COLUMNS.items() }
			flux = values['flux'] * 1e7
			classes = [ ('A', .1), ('B', 1), ('C', 10), ('M', 100), ('X', 1000) ]
			xclass = None
			for ch, u in classes[::-1]:
				if flux >= u:
					xclass = f'{ch}{(flux / u):.1f}'[:4]
					break
			row = {
				'start_time': time,
				'peak_time': (time + timedelta(minutes=values['dt1'])) if values['dt1'] < 999 else time,
				'end_time': time + timedelta(minutes=values['dt']),
				'note': line[196:].strip() or None,
				'class': xclass,
				'active_region': int(values['active_region']) if values['active_region'] > 0 else None
			}
			data.append([row[c] if c in row else values[c] for c in columns])

	print('parsed', len(data))
	upsert_many('events.'+TABLE, columns, data, conflict_constraint='start_time', write_nulls=True)
	print('inserted')

if __name__ == '__main__':
	parse_xf()
