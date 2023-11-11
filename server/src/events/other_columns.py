import numpy as np
from database import pool, log
from events.table import parse_column_id
from events.generic_columns import select_generics
from events.generic_core import apply_changes, recompute_for_row, recompute_generics

DEFAULT_DURATION = 72

def _compute_duration(for_row=None, entity='forbush_effects'):
	assert entity == 'forbush_effects'
	with pool.connection() as conn:
		q = f'SELECT id, duration, EXTRACT(EPOCH FROM time)::integer FROM events.{entity} '
		if for_row is not None:
			q += f'WHERE time >= (SELECT time FROM events.{entity} WHERE id = %s) ORDER BY TIME LIMIT 2'
			rows = conn.execute(q, [for_row]).fetchall()
		else:
			rows = conn.execute(q + ' ORDER BY time').fetchall()
		data = np.array(rows)
		eid, src_dur, hours = data[:,0], data[:,1], data[:,2] // 3600
		t_after = np.empty_like(hours)
		t_after[:-1] = hours[1:] - hours[:-1]
		t_after[-1] = 9999
		src_dur[src_dur < 1] = DEFAULT_DURATION
		duration = np.minimum(src_dur, t_after)
		query = f'UPDATE events.{entity} SET duration = %s WHERE id = %s'
		conn.cursor().executemany(query, np.column_stack((duration, eid)).tolist())
		log.info('Computed %s duration', entity)

def _compute_vmbm(generics, for_row=None, entity='forbush_effects', column='vmbm'):
	assert entity == 'forbush_effects'
	vm, bm = [next((g for g in generics if g.entity == entity and g.pretty_name == name)
		, None) for name in ('V max', 'B max')]
	if not vm or not bm:
		raise BaseException('Vm or Bm not found')
	with pool.connection() as conn:
		q = f'SELECT id, {vm.name}, {bm.name} FROM events.{entity}'
		curs = conn.execute(q) if for_row is None else conn.execute(q + ' WHERE id = %s', [for_row])
		data = np.array(curs.fetchall(), dtype='f8')
		result = data[:,1] * data[:,2] / 5 / 400

		data = np.column_stack((np.where(np.isnan(result), None, np.round(result, 2)), data[:,0].astype('i8')))
		apply_changes(data[:,1], data[:,0], entity, column, conn)
		query = f'UPDATE events.{entity} SET {column} = %s WHERE {entity}.id = %s'
		conn.cursor().executemany(query, data.tolist())

def compute_all(for_row=None):
	generics = select_generics(select_all=True)
	_compute_duration(for_row)
	if for_row is None:
		res = recompute_generics(generics)
	else:
		res = recompute_for_row(generics, for_row)
	_compute_vmbm(generics, for_row)
	return res

def compute_column(cid):
	entity, name = parse_column_id(cid)
	generics = select_generics(select_all=True)
	if name == 'vmbm':
		_compute_vmbm(generics, entity=entity)
	elif name == 'duration':
		_compute_duration(entity=entity)
	else:
		found = next((g for g in generics if g.name == name), None)
		if not found:
			raise ValueError('Column not found')
		return recompute_generics(generics)
	return True
