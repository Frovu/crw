
from datetime import datetime, timedelta
from pathlib import Path
import os
from typing import Literal
import pymysql.cursors
import numpy as np

nmdb_conn = None

def connect_nmdb(station):
	global nmdb_conn
	if not nmdb_conn:
		nmdb_conn = pymysql.connect(
			host=os.environ.get('NMDB_HOST'),
			port=int(os.environ.get('NMDB_PORT', 3306)),
			user=os.environ.get(f'NMDB_{station}_USER'),
			password=os.environ.get(f'NMDB_{station}_PASS'),
			database='nmdb')

def read_month(station, year, month, what: Literal['C', 'U', 'P'], time_res: Literal['1h', '1m']):
	result = []

	nm1 = '' if time_res == '1h' else '1'
	wc1 = '0' if time_res == '1h' else '1'
	path = Path(f'/mnt/cr0/Inetpub/ftproot/COSRAY!/FTP_NM{nm1}/{what}').resolve()
	path = next((d for d in path.iterdir() if d.name.startswith(str(year))), None)
	if not path:
		return []
	path = next((d for d in path.iterdir() if d.name.upper().endswith(station)), None)
	if not path:
		print(f'Neutron: Not found NM station: {year}/{station}')
		return []
	files = [f for f in path.glob(f'{year%100:02}{month:02}*')]
	pref ='.60' if time_res == '1h' else '.01'
	file_path = next((f for f in files if f.suffix and f.suffixes[0].upper().startswith('.C'+wc1)),
		next((f for f in files if f.suffix and f.suffixes[0].startswith(pref)),
		next((f for f in files if f.suffix and f.suffixes[0].upper().startswith('.W'+wc1)), None)))
	if not file_path:
		print(f'Neutron: Not found NM {time_res} {what} file: {year}/{station}/{month}')
		return []
	try:
		print('reading', file_path.name)
		with open(file_path) as file:
			if '.txt' in file_path.name:
				for line in file:
					if not line[0].isdigit():
						continue
					date = datetime.strptime(line[:19], '%Y-%m-%d %H:%M:%S')
					cnt = float(line.split()[2])
					if cnt > 2000:
						cnt = round(cnt / 60, 2)
					result.append((date, cnt))
			else: # w0c c0c
				increment = timedelta(hours=1) if time_res == '1h' else timedelta(minutes=1)
				time_cursor = datetime(year, month, 1)
				while time_cursor.month == month:
					line = next(file, None)
					parts = line.split()[:12]
					if not parts[0].isdigit():
						continue
					for cnt in parts:
						val = float(cnt) / (10 if what == 'P' else 60) # imp/min => Hz
						if what != 'P' and file_path.suffixes[0].upper() != '.W0C' and station == 'MOSC':
							val *= 1.4051
						result.append((time_cursor, round(val, 2)))
						time_cursor += increment
	except Exception as e:
		print(f'Failed to parse {file_path}: {str(e)}')
	return np.array(result)

def read_all_month(station, year, month, time_res: Literal['1h', '1m']):
	c = read_month(station, year, month, 'C', time_res)
	u = read_month(station, year, month, 'U', time_res)
	p = read_month(station, year, month, 'P', time_res)

	if not (len(c) == len(u) == len(p)):
		print('data legth differs!')
		return []
	
	data = np.column_stack((c[:,0], c[:,1], c[:,1], u[:,1], p[:,1]))
	return data

def upload_nmdb_ori(station, year, month, time_res: Literal['1h', '1m']):
	data = read_all_month(station, year, month, time_res)
	data = np.where(data == 0, None, data).tolist()
	if not len(data):
		return
	print(*data[0])
	print(*data[-1])

	table = f'nmdb.{station}_{"ori" if time_res == '1m' else '1h'}'
	fields = ['corr_for_efficiency', 'corr_for_pressure', 'uncorrected', 'pressure_mbar']
	if time_res == '1m':
		fields = ['measured'+f for f in fields]
	q = f'INSERT IGNORE INTO {table} '+\
	f'(start_date_time, {", ".join(fields)}) '+\
	'VALUES (%s, %s, %s, %s, %s) '+\
	('' if time_res == '1m' else 'ON DUPLICATE KEY UPDATE corr_for_efficiency=VALUES(corr_for_efficiency), corr_for_pressure=VALUES(corr_for_pressure)')

	with nmdb_conn.cursor() as cursor:
		cursor.executemany(q, data)
		nmdb_conn.commit()
	
	print('inserted', year, month)

if __name__ == '__main__':
	sta = 'MOSC'
	res = '1h'

	connect_nmdb(sta)
	for y in range(2025, 2026):
		for month in range(3, 5):
			# d = upload_nmdb_ori(sta, y, month, res)
			d = read_all_month(sta, y, month, res)
			# print(len(d))
			# if not len(d):
			# 	continue
			# print(*d[0])
			# print(*d[-1])

	nmdb_conn.close()