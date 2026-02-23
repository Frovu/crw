from time import time
import traceback
import numpy as np
from datetime import datetime, timezone

from psycopg import rows
from database import pool, log, upsert_many, ComputationResponse

from events.columns.computed_column import ComputedColumn, select_computed_column_by_id, apply_changes, DATA_TABLE, DEF_TABLE
from events.columns.parser import columnParser, ColumnComputer
from events.columns.functions.common import Value, TYPE, DTYPE, value_to_sql_dtype

def _compute(definition: str, target_ids: list[int] | None = None):
	t_start = time()

	parsed = columnParser.parse(definition)

	computer = ColumnComputer(target_ids=target_ids)
	ids = np.array(computer.ctx.select_columns_by_name(['id'])[0]).astype(int)
	result = computer.transform(parsed)

	if not target_ids:
		log.debug('Computed %s in %ss', definition, round(time() - t_start, 2))

	if result.type != TYPE.COLUMN:
		raise ValueError('Evaluated to a non-column value')

	return ids, result

	# if target_ids is not None:
	# 	ids = _select(None, ('id',))[0].astype(int)
	# 	idx = np.where(ids == for_row)[0][0]
	# 	margin = 3 if len(target_ids) > 6 else len(target_ids) // 3
	# 	target_id, result = _do_compute(g, ids[idx-margin:idx+margin+1].tolist())
	# 	target_id, result = target_id[margin:-margin], result[margin:-margin]
	# else:
	# 	locol.debug(f'Computing {col.name}')
	# 	target_id, result = _do_compute(g)


	# if result is None:
	# 	return f'{col.name}: empty result'
	# if target_ids is None:
	# 	log.info(f'Computed {col.name} in {round(time()-t_start,2)}s')
			
def _upsert_data(col: ComputedColumn, ids, result: Value, whole_column: bool = False):
	val = [datetime.fromtimestamp(v, timezone.utc) for v in result.value] if result.dtype == DTYPE.TIME else result.value
	data = zip(ids, val)

	upsert_many(DATA_TABLE, ['feid_id', col.sql_name], data, conflict_constraint='feid_id')
	
	with pool.connection() as conn:
		apply_changes(conn, col)
		if whole_column:
			conn.execute(f'UPDATE events.{DEF_TABLE} SET computed_at = CURRENT_TIMESTAMP WHERE id = %s', [col.id])
	

def upsert_column(uid, json_body, col_id):
	name, description, definition, is_public = \
		[json_body.get(i) for i in ('name', 'description', 'definition', 'is_public')]

	ids, result = _compute(definition)
	dtype = value_to_sql_dtype(result.dtype)

	with pool.connection() as conn:
		if col_id is None:
			curs = conn.execute(f'INSERT INTO events.{DEF_TABLE} ' +\
				'(owner_id, name, description, definition, is_public, dtype) VALUES (%s,%s,%s,%s,%s,%s) RETURNING *',
				[uid, name, description, definition, is_public, dtype])
			curs.row_factory = rows.dict_row	
			column = ComputedColumn.from_sql_row(curs.fetchone())
			column.drop_in_table(conn)
			column.init_in_table(conn)
			log.info(f'Column created by ({uid}): #{column.id} {column.name}')
		else:
			curs = conn.execute(f'UPDATE events.{DEF_TABLE} SET ' +\
				'nickname=%s, description=%s, definition=%s, is_public=%s, dtype=%s WHERE id = %s RETURNING *',
				[name, description, definition, is_public, col_id, dtype])
			curs.row_factory = rows.dict_row
			column = ComputedColumn.from_sql_row(curs.fetchone())
			column.drop_in_table(conn)
			column.init_in_table(conn)
			log.info(f'Column edited by ({uid}): #{column.id} {column.name}')
	
	_upsert_data(column, ids, result, True)

	return column

def delete_column(user_id, col_id):
	column = select_computed_column_by_id(col_id, user_id)

	if not column:
		raise ValueError('Not found')
	
	with pool.connection() as conn:
		conn.execute(f'DELETE FROM events.{DEF_TABLE} WHERE id = %s', [column.id])
		log.info(f'Column deleted by ({user_id}): #{column.id} {column.name} = {column.definition}')


def compute_by_id(user_id, col_id):
	t_start = time()

	try:
		column = select_computed_column_by_id(col_id, user_id)
		if not column: 
			raise ValueError('Column not found')
		
		_compute(column.definition)

	except Exception as e:
		traceback.print_exc()
		return ComputationResponse(time=time()-t_start, done=False, error=str(e)).to_dict()
	
	return ComputationResponse(time=time()-t_start).to_dict()

def compute_row(row_id):
	pass

def compute_all():
	pass