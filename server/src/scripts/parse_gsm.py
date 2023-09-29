from datetime import datetime
import sys, os
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../'))
from data_series.gsm.database import pool, series
from core.database import upsert_many
from math import atan2, pi

PATH = 'data/A0A1.txt'

# Presumes file contains
# Date hour t A0 A10m Ax Ay Az Axy 

def parse():
	print(f'Reading file: {PATH}')
	with open(PATH) as file:
		next(file)
		next(file)
		data = []
		for line_number, line in enumerate(file, 1):
			if line == '\n': continue
			try:
				split = line.split()
				time = datetime(*[int(d) for d in split[0].split('.')], int(split[1])-1)
				values = [float(v) for v in split[3:]]
				ax, ay = values[-4], values[-3]
				phi_axy = round(atan2(ay, ax) / pi * 180, 1)
				data.append((time, *values, phi_axy if phi_axy >= 0 else 360 + phi_axy))
			except Exception as e:
				print(f'Failed on line header+{line_number}:')
				print([line])
				print(e)
				return
	print(f'Parsed [{len(data)}] from {data[0][0]} to {data[-1][0]}')
	print('Inserting...', end='', flush=True)
	upsert_many('gsm_result', ['time'] + series, data, do_nothing=True)
	print('done!')

if __name__ == '__main__':
	parse()
