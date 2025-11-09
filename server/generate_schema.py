import sys, os, re

sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), './src'))

from events.columns.column import Column, DTYPE
import events.columns.computed_column
import events.columns.series
import events.changelog
from events.table_structure import ALL_TABLES

from typing import get_origin, Any, LiteralString
import ts_type as ts

TARGET = '../client/src/api.d.ts'

class Builder(ts.NodeBuilder):
	def handle_unknown_type(self, t: Any) -> ts.TypeNode:
		if t is LiteralString:
			return ts.String()
		return super().handle_unknown_type(t)
	
def dtype_to_ts(dtype: DTYPE):
	if dtype in ['enum', 'text']:
		return 'string'
	if dtype in ['real', 'integer']:
		return 'number'
	return 'Date'

def generate_table_type(tbl: str, cols: list[Column], write):
	write(f'\t{tbl}: {{\n')
	for col in cols:
		nullable = '' if col.not_null else ' | null' 
		write(f'\t\t{col.sql_name}: {dtype_to_ts(col.dtype)}{nullable};\n')
	write('\t},\n\n')

rendered = ts.generator.render(Builder)

with open(TARGET, 'w') as f:
	f.write('export type Column = StaticColumn | ComputedColumn;\n\n')
	for text in rendered.values():
		text = re.sub(r'export type[^;]+;', '', text)
		text = re.sub(r'.*_([a-zA-Z]+) = \{', r'export type \1 = {', text)
		text = text.replace('\n\n', '').replace(';exp', ';\n\nexp')
		text = text.replace(' Column =', ' StaticColumn =')
		text = re.sub(r'"([a-z_]+)":', r'\1:', text) 
		text = re.sub(r'"([a-z_]+)"', r"'\1'", text) 
		f.write(text + '\n\n')

	f.write('export interface tableStructure {\n')
	for tbl, cols in ALL_TABLES.items():
		generate_table_type(tbl, cols, f.write)
	f.write('}\n')