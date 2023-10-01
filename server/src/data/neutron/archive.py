import os
from datetime import datetime, timedelta
from pathlib import Path
from database import log

def obtain(interval, stations):
	dt_from, dt_to = [datetime.utcfromtimestamp(t) for t in interval]
	dirp = Path(os.environ.get('NM_ARCHIVE_PATH')).resolve()
	if not dirp.is_dir():
		return log.error('Dir not found: %s', str(dirp))
	data = dict()
	for station_i, station in enumerate(stations):
		def add_count(date, count):
			if date not in data:
				data[date] = [None for s in stations]
			data[date][station_i] = count
		for year in range(dt_from.year, dt_to.year + 1):
			path = next(dirp.glob(str(year) + '[cC]'), None)
			if not path: continue
			path = next((d for d in path.iterdir() if d.name.upper().endswith(station)), None)
			if not path:
				log.debug(f'Neutron: Not found NM station: {year}/{station}')
				continue
			for month in range(1 if year != dt_from.year else dt_from.month, 13 if year != dt_to.year else dt_to.month + 1):
				files = path.glob(f'{year%100:02}{month:02}*')
				file_path = next((f for f in files if f.suffix and f.suffixes[0].upper() in ['.C0C', '.60C']), None)
				if not file_path:
					log.info(f'Neutron: Not found NM counts file: {year}/{station}/{month}')
					continue
				try:
					with open(file_path) as file:
						if '.C0C' in file_path.name.upper():
							for i in range(7):
								next(file) # skip comment
							time_cursor = datetime(year, month, 1)
							while time_cursor.month == month:
								line = next(file, None)
								for cnt in line.split()[:12]:
									add_count(time_cursor, float(cnt) / 60) # imp/min => Hz
									time_cursor += timedelta(hours=1)
								assert len(data) % 12 == 0
						else: # if .60c.txt
							for i in range(2):
								next(file) # skip header
							for line in file:
								date = datetime.strptime(line[:19], '%Y-%m-%d %H:%M:%S')
								cnt = float(line[24:].strip())
								add_count(date, cnt)
				except Exception as e:
					log.warn(f'Failed to parse {file_path}: {e}')
	return [[date, *data[date]] for date in sorted(data.keys())]