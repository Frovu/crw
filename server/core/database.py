import json, os

dirname = os.path.dirname(__file__)
with open(os.path.join(dirname, '../config/forbush_table.json')) as file:
	columns_info = json.load(file)

def get_short_name(column):
	info = columns_info.get(column)
	return info.get('short_name', info.get('name'))

def get_column_type(column):
	return columns_info.get(column).get('type', 'real')

def list_columns():
	return list(columns_info.keys())