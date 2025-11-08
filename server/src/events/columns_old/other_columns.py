import traceback
from time import time
from threading import Thread, Lock
import numpy as np
from database import pool, log
from events.columns.generic_columns import select_generics
from events.columns.generic_core import apply_changes, recompute_for_row, recompute_generics, G_DERIVED, SELECT_FEID

DEFAULT_DURATION = 72

compute_lock = Lock()
compute_cache = {}

def str_err(func):
	def wrapper(*args, **kwargs) -> list:
		try:
			func(*args, **kwargs)
			return [None]
		except Exception as exc:
			log.error(f'Error in {func.__name__}: {traceback.format_exc()}')
			return [str(exc)]
	wrapper.__name__ = func.__name__
	return wrapper

@str_err
def _compute_duration(for_row=None):
	with pool.connection() as conn:
		q = 'SELECT id, duration, EXTRACT(EPOCH FROM time)::integer FROM events.feid '
		if for_row is not None:
			q += 'WHERE time >= (SELECT time FROM events.feid WHERE id = %s) ORDER BY TIME LIMIT 2'
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
		query = 'UPDATE events.feid SET duration = %s WHERE id = %s'
		conn.cursor().executemany(query, np.column_stack((duration, eid)).tolist())
		log.info('Computed duration')

@str_err
def _compute_vmbm(generics, for_row=None, column='vmbm'):
	vm, bm = [next((g for g in generics if g.pretty_name == name)
		, None) for name in ('V max', 'B max')]
	if not vm or not bm:
		raise Exception('Vm or Bm not found')
	with pool.connection() as conn:
		q = f'SELECT id, {vm.name}, {bm.name} FROM {SELECT_FEID}'
		curs = conn.execute(q) if for_row is None else conn.execute(q + ' WHERE id = %s', [for_row])
		data = np.array(curs.fetchall(), dtype='f8')
		result = data[:,1] * data[:,2] / 5 / 400

		data = np.column_stack((np.where(np.isnan(result), None, np.round(result, 2)), data[:,0].astype('i8')))
		query = f'UPDATE events.feid SET {column} = %s WHERE id = %s'
		conn.cursor().executemany(query, data.tolist())
		log.info('Computed VmBm')
		apply_changes(conn, column, 'feid')

@str_err
def _compute_x_v_idx(for_row=None):
	with pool.connection() as conn:
		w, v = (' WHERE id = %s', [for_row]) if for_row is not None else ('', [])
		conn.execute('UPDATE events.coronal_mass_ejections SET v_index = v_mean_0 / 1000' + w, v)
		conn.execute('UPDATE events.solar_flares SET x_index = magnitude * dt1 / 1000' + w, v)

def _compute_all(for_row):
	generics = select_generics(select_all=True)
	err = _compute_duration(for_row)

	if for_row is None:
		err += recompute_generics(generics)
	else:
		err += recompute_for_row([g for g in generics if g.params.operation not in G_DERIVED], for_row)
		err += recompute_for_row([g for g in generics if g.params.operation     in G_DERIVED], for_row)
	err += _compute_vmbm(generics, for_row)
	err += _compute_x_v_idx(for_row)
	err = '; '.join([e for e in err if e])
	compute_cache[for_row] = (compute_cache.get(for_row, [time()])[0], time(), err)

def compute_all(for_row=None):
	with compute_lock:
		if for_row in compute_cache:
			start, finish, err = compute_cache[for_row]
			if finish:
				del compute_cache[for_row]
				return { 'time': round(finish - start, 1), 'done': True, 'error': err }
			else:
				return { 'time': round(time() - start, 1), 'done': False, 'error': err }
		else:
			compute_cache[for_row] = (time(), None, None)
	t = Thread(target=_compute_all, args=[for_row])
	t.start()
	t.join(timeout=3)
	start, finish, err = compute_cache[for_row]
	elapsed = time() - start
	done = elapsed < 3
	if done:
		del compute_cache[for_row]
	return { 'time': round(elapsed, 2), 'done': done, 'error': err }

def compute_column(column):
	generics = select_generics(select_all=True)
	if column == 'vmbm':
		return _compute_vmbm(generics)[0]
	elif column in ['flr_x_index', 'cme_v_index']:
		return _compute_x_v_idx()[0]
	elif column == 'duration':
		return _compute_duration()[0]
	else:
		found = next((g for g in generics if g.name == column), None)
		if not found:
			raise ValueError('Column not found')
		return recompute_generics(found)[0]
	return None
