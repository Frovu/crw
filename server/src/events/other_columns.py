import traceback
import numpy as np
from database import pool, log
from events.generic_columns import select_generics
from events.generic_core import apply_changes, recompute_for_row, recompute_generics

DEFAULT_DURATION = 72

def _compute_duration(for_row=None, entity='forbush_effects'):
	with pool.connection() as conn:
		q = f'SELECT id, duration, EXTRACT(EPOCH FROM time)::integer FROM events.{entity} '
		if for_row is not None:
			q += f'WHERE time >= (SELECT time FROM events.{entity} WHERE id = %s) ORDER BY TIME LIMIT 2'
			rows = conn.execute(q).fetchall()
		else:
			rows = conn.execute(q + ' ORDER BY time').fetchall()
		data = np.array(rows)
		eid, src_dur, hours = data[:,0], data[:,1], data[:,2] // 3600
		t_after = hours[1:] - hours[:1]
		src_dur[src_dur < 1] = DEFAULT_DURATION
		duration = np.minimum(src_dur, t_after)
		query = f'UPDATE events.{entity} SET duration = %s WHERE id = %s'
		conn.cursor().executemany(query, np.column_stack((eid, duration)).tolist())
		log.info('Computed %s duration', entity)

def _compute_vmbm(generics, for_row=None, entity='forbush_effects', column='vmbm'):
	vm, bm = [next((g for g in generics if g.entity == entity and g.pretty_name == name)
		, None) for name in ('V max', 'B max')]
	if not vm or not bm:
		return
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
	try:
		generics = select_generics(select_all=True)
		_compute_duration(for_row)
		if for_row is None:
			recompute_generics(generics)
		else:
			recompute_for_row(generics, for_row)
		_compute_vmbm(generics, for_row)
	except:
		log.error('Failed to re-compute table: %s', traceback.format_exc())

def compute_column(name):
	try:
		generics = select_generics(select_all=True)
		if name == 'vmbm':
			_compute_vmbm(generics)
		elif name == 'duration':
			_compute_duration()
		else:
			found = next((g for g in generics if g.name == name), None)
			if not found:
				raise ValueError('Column not found')
			return recompute_generics(generics)
		return True
	except:
		log.error('Failed to re-compute %s: %s', name, traceback.format_exc())
