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


