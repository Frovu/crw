from time import time
import traceback, ts_type
import numpy as np
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from psycopg import rows, sql
from threading import Thread, Lock
from concurrent.futures import ThreadPoolExecutor

from database import pool, log, upsert_many, ComputationResponse
from events.columns.computed_column import ComputedColumn, select_computed_column_by_id, select_computed_columns, apply_changes, DATA_TABLE, DEF_TABLE
from events.columns.parser import columnParser, ColumnComputer, functions, helpers_desc
from events.columns.series import Series, SERIES
from events.columns.functions.common import Function, Value, TYPE, DTYPE, value_to_sql_dtype

@ts_type.gen_type
@dataclass
class FeidInfoResponse:
	series: list[Series]
	functions: dict[str, Function]
	helpers: dict[str, tuple[str, str]]

	def to_dict(self):
		return asdict(self)

compute_lock = Lock()
compute_all_active: None | tuple[float, bool, str | None] = None

def _compute(definition: str, target_ids: list[int] | None = None):
	try:
		parsed = columnParser.parse(definition)

		computer = ColumnComputer(target_ids=target_ids)
		ids = np.array(computer.ctx.select_columns_by_name(['id'])[0]).astype(int)
		result = computer.transform(parsed)

		if result.type == TYPE.SERIES:
			raise Exception('Computation result was a series, not a column')

		if result.type == TYPE.LITERAL:
			result = Value(TYPE.COLUMN, result.dtype, np.full_like(ids, result.value))
	except Exception as e:
		traceback.print_exc()
		return None, None, e

	return ids, result, None
			
def _upsert_data(col: ComputedColumn, ids: np.ndarray, result: Value, whole_column: bool = False):
	res = result.value
	if result.dtype == DTYPE.TIME:
		val = [None if np.isnan(v) else datetime.fromtimestamp(v, timezone.utc) for v in res]
	elif result.dtype == DTYPE.INT:
		val = np.where(~np.isfinite(res), None, np.round(res).astype(int))
	elif result.dtype == DTYPE.REAL:
		val = np.where(~np.isfinite(res), None, np.round(res, 2))
	elif result.dtype == DTYPE.BOOL:
		val = np.where(~np.isfinite(res), 0, res.astype(int))
	else:
		val = res
		
	data = zip(ids, val)

	upsert_many(DATA_TABLE, ['feid_id', col.sql_name], data, conflict_constraint='feid_id', write_nulls=True)
	
	with pool.connection() as conn:
		apply_changes(conn, col)
		if whole_column:
			conn.execute(f'UPDATE events.{DEF_TABLE} SET computed_at = CURRENT_TIMESTAMP WHERE id = %s', [col.id])

def _compute_and_upsert(col: ComputedColumn, target_ids: list[int] | None = None):
	ids, result, err = _compute(col.definition, target_ids)
	if err: return err
	assert ids is not None and result
	_upsert_data(col, ids, result, whole_column=not target_ids)
	return None

def upsert_column(user_id: int, json_body, col_id: int | None):
	name, description, definition, is_public = \
		[json_body.get(i) for i in ('name', 'description', 'definition', 'is_public')]

	ids, result, err = _compute(definition)
	if err: raise err
	assert ids is not None and result
	
	dtype = value_to_sql_dtype(result.dtype)

	with pool.connection() as conn:
		if col_id is None:
			curs = conn.execute(f'INSERT INTO events.{DEF_TABLE} ' +\
				'(owner_id, name, description, definition, is_public, dtype) VALUES (%s,%s,%s,%s,%s,%s) RETURNING *',
				[user_id, name, description, definition, is_public, dtype])
			curs.row_factory = rows.dict_row	
			column = ComputedColumn.from_sql_row(curs.fetchone())
			column.drop_in_table(conn)
			column.init_in_table(conn)
			log.info(f'Column created by ({user_id}): #{column.id} {column.name}')
		else:
			curs = conn.execute(f'UPDATE events.{DEF_TABLE} SET ' +\
				'name=%s, description=%s, definition=%s, is_public=%s, dtype=%s WHERE id = %s',
				[name, description, definition, is_public, dtype, col_id])
			
			curs = conn.execute(f'SELECT * from events.{DEF_TABLE} WHERE id = %s', [col_id])
			curs.row_factory = rows.dict_row
			column = ComputedColumn.from_sql_row(curs.fetchone())
			column.drop_in_table(conn)
			column.init_in_table(conn)
			log.info(f'Column edited by ({user_id}): #{column.id} {column.name}')
	
	_upsert_data(column, ids, result, whole_column=True)

	return column

def delete_column(user_id: int, col_id: int):
	column = select_computed_column_by_id(col_id, user_id)

	if not column:
		raise ValueError('Not found')
	
	with pool.connection() as conn:
		conn.execute(f'DELETE FROM events.{DEF_TABLE} WHERE id = %s', [column.id])
		conn.execute(sql.SQL(f'ALTER TABLE events.{DATA_TABLE} DROP COLUMN {{}}').format(sql.Identifier(column.sql_name)))
		log.info(f'Column deleted by ({user_id}): #{column.id} {column.name} = {column.definition}')

def compute_by_id(user_id: int, col_id: int):
	t_start = time()

	column = select_computed_column_by_id(col_id, user_id)
	if not column: 
		raise ValueError('Column not found')
	
	err = _compute_and_upsert(column)
	if err: raise err

	if not err:
		log.debug('Computed %s in %ss', column.definition, round(time() - t_start, 2))
	return ComputationResponse(time=time()-t_start, error=str(err) if err else None).to_dict()

def compute_rows(row_ids: list[int]):
	t_start = time()

	columns = select_computed_columns(select_all=True)
	with ThreadPoolExecutor() as executor:
		func = lambda col: _compute_and_upsert(col, row_ids)
		errors = executor.map(func, columns)

	str_errors = '; '.join([f'{col.name}: {err}' for col, err in zip(columns, errors) if err])
	return ComputationResponse(time=time()-t_start, error=str_errors if str_errors else None).to_dict()

def _do_compute_all():
	global compute_all_active
	columns = select_computed_columns(select_all=True)

	# TODO: shared computation context
	with ThreadPoolExecutor() as executor:
		func = lambda col: _compute_and_upsert(col)
		errors = executor.map(func, columns)
	
	str_errors = '; '.join([f'{col.name}: {err}' for col, err in zip(columns, errors) if err])
	compute_all_active = (compute_all_active[0] if compute_all_active else time(), True, str_errors)

def compute_all(for_row=None):
	global compute_all_active
	with compute_lock:
		if compute_all_active:
			start, finish, err = compute_all_active
			if finish:
				compute_all_active = None
				return ComputationResponse(time=time()-start, error=str(err) if err else None).to_dict()
			else:
				return ComputationResponse(time=time()-start, done=False).to_dict()
		else:
			compute_all_active = (time(), False, None)

	t = Thread(target=_do_compute_all)
	t.start()
	return ComputationResponse(time=0, done=False).to_dict()

def get_info():
	return FeidInfoResponse(SERIES, functions, helpers_desc).to_dict()