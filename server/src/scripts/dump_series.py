
import sys, os
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../'))
from datetime import datetime, timezone
from data import particles_and_xrays

dt_from = datetime(2022, 1, 1, tzinfo=timezone.utc).timestamp()
dt_to = datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp()

path = 'tmp/out.txt'

def fetch():
	data = particles_and_xrays.select_hourly_averaged((int(dt_from), int(dt_to)), 'e2')
	with open(path, 'w') as f:
		for tst, val in data:
			f.write(f'{datetime.fromtimestamp(tst, timezone.utc)} {round(val, 3) if val else -1}\n') 

if __name__ == '__main__':
	fetch()