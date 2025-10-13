import os
from database import log, pool, upsert_many

def _init():
	with open(os.path.join(os.path.dirname(__file__), './_init_db.sql'), encoding='utf-8') as file:
		init_text = file.read()
	with pool.connection() as conn:
		conn.execute(init_text)
_init()

def import_summary(data):
	log.info('Importing swpc daily summary')
	upsert_many('swpc.daily_summary', ['time', 'disturbance_observed', 'disturbance_arrival'], data)

def fetch_summary():
	with pool.connection() as conn:
		data = conn.execute('SELECT EXTRACT(EPOCH FROM time), disturbance_observed, disturbance_arrival '+\
			'FROM swpc.daily_summary ORDER BY time').fetchall()
	return data 