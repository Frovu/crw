import json, os
import psycopg2
import psycopg2.extras
pg_conn = psycopg2.connect(
	dbname = 'cr_aid',
	user = 'cr_aid',
	password = os.environ.get('DB_PASSWORD'),
	host = os.environ.get('DB_HOST')
)

dirname = os.path.dirname(__file__)
with open(os.path.join(dirname, '../config/tables.json')) as file:
	tables_info = json.load(file)

def select_all(t_from=None, t_to=None):
	with pg_conn.cursor() as cursor:
		cond = ' WHERE time >= %s' if t_from else ''
		if t_to: cond += (' AND' if cond else ' WHERE') + ' time < %s'
		cursor.execute('SELECT * FROM default_view' + cond + ' ORDER BY time', [p for p in [t_from, t_to] if p is not None])
		return cursor.fetchall(), [desc[0] for desc in cursor.description]