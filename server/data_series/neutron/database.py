from core.database import pg_conn
import os

def init():
	path = os.path.join(os.path.dirname(__file__), './database_init.sql')
	with open(path) as file, pg_conn.cursor() as cursor:
		cursor.execute(file.read())
init()

def select(t_from: int, t_to: int, stations: list[string]):
	query = 'SELECT COASLESCE(corrected, original) FROM neutron_counts WHERE to_timestamp(%s) <= time AND time < to_timestamp(%s)'