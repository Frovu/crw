from time import time
import traceback

from psycopg import rows
from database import pool, log, upsert_many, ComputationResponse

from events.columns.computed_column import ComputedColumn, select_computed_column_by_id, apply_changes, DATA_TABLE, DEF_TABLE
from events.columns.parser import columnParser, ColumnComputer

def compute(definition: str, target_ids: list[int] | None = None):

	parsed = columnParser.parse(definition)

	t_start = time()

	computer = ColumnComputer(target_ids=target_ids)
	ids = computer.ctx.select_columns_by_name(['id'])[0]
	result = computer.transform(parsed)
	# if target_ids is not None:
	# 	ids = _select(None, ('id',))[0].astype(int)
	# 	idx = np.where(ids == for_row)[0][0]
	# 	margin = 3 if len(target_ids) > 6 else len(target_ids) // 3
	# 	target_id, result = _do_compute(g, ids[idx-margin:idx+margin+1].tolist())
	# 	target_id, result = target_id[margin:-margin], result[margin:-margin]
	# else:
	# 	locol.debug(f'Computing {col.name}')
	# 	target_id, result = _do_compute(g)

	print(ids)
	print(result)

	# if result is None:
	# 	return f'{col.name}: empty result'
	# if target_ids is None:
	# 	log.info(f'Computed {col.name} in {round(time()-t_start,2)}s')

	# data = np.column_stack((target_id, result)).tolist()
	# upsert_many(DATA_TABLE, ['feid_id', col.name], data, conflict_constraint='feid_id')
	# with pool.connection() as conn:
	# 	apply_changes(conn, col.name, dtype=col.sql_data_type)
	# 	if target_ids is None:
	# 		conn.execute(f'UPDATE events.{DEF_TABLE} SET last_computed = CURRENT_TIMESTAMP WHERE id = %s', [col.id])
			


def upsert_column(uid, json_body, col_id):
	name, description, definition, is_public = \
		[json_body.get(i) for i in ('name', 'description', 'definition', 'is_public')]
	# columns = select_computed_columns(uid)

	res = compute(definition)

	with pool.connection() as conn:
		if col_id is None:
			curs = conn.execute(f'INSERT INTO events.{DEF_TABLE} ' +\
				'(owner_id, name, description, definition, is_public) VALUES (%s,%s,%s,%s,%s) RETURNING *',
				[uid, name, description, definition, is_public])
			curs.row_factory = rows.dict_row	
			column = ComputedColumn.from_sql_row(curs.fetchone())
			column.init_in_table(conn)
			log.info(f'Column created by ({uid}): #{column.id} {column.name}')
		else:
			curs = conn.execute(f'UPDATE events.{DEF_TABLE} SET ' +\
				'nickname=%s, description=%s, definition=%s, is_public=%s WHERE id = %s RETURNING *',
				[name, description, definition, is_public, col_id])
			curs.row_factory = rows.dict_row
			column = ComputedColumn.from_sql_row(curs.fetchone())
			# FIXME: alter sql datatype
			log.info(f'Column edited by ({uid}): #{column.id} {column.name}')

	return column

def compute_by_id(user_id, col_id):
	t_start = time()

	try:
		column = select_computed_column_by_id(col_id, user_id)
		if not column: 
			raise ValueError('Column not found')
		
		compute(column.definition)

	except Exception as e:
		traceback.print_exc()
		return ComputationResponse(time=time()-t_start, done=False, error=str(e)).to_dict()
	
	return ComputationResponse(time=time()-t_start).to_dict()

def compute_row(row_id):
	pass

def compute_all():
	pass