# pascal if to json regex:
# .*'([\d\.]+)'.*\[(\d+)\.\.(\d+)\].*   ->   "$1": [$2, $3], 

from datetime import datetime, timedelta
import sys, os, json
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../'))
from data_series.gsm.database import pool

PATH = 'data/gle_list.json'

def parse():
	with open(PATH) as file:
		gle = json.load(file)
	data = []
	for day in gle:
		time = datetime(*[int(d) for d in day.split('.')])
		h0, h1 = gle[day]
		for hour in range(h0-1, h1): # 1-24 -> 0-23
			data.append((time + timedelta(hours=hour),))
	print(f'Updating GSM table with GLE mask of {len(data)} hours total')
	with pool.connection() as conn, conn.cursor() as curs:
		curs.executemany('UPDATE gsm_result SET is_gle = \'t\' WHERE time = %s', data)
		print('Updated ' + str(curs.rowcount))

if __name__ == '__main__':
	parse()