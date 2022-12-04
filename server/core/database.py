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
with open(os.path.join(dirname, '../config/forbush_table.json')) as file:
	columns_info = json.load(file)

TABLE_NAME = 'forbush_effects'

def get_short_name(column):
	info = columns_info.get(column)
	return info.get('short_name', info.get('name'))

def get_column_type(column):
	return columns_info.get(column).get('type', 'real')

def list_columns():
	return list(columns_info.keys())