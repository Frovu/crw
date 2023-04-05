from core.database import pool, log, tables_info
import traceback
import numpy as np

def _compute_vmbm(entity='forbush_effects'):
	with pool.connection() as conn:
		curs = conn.execute(f'SELECT id, v_max, b_max FROM events.{entity}')
		data = np.array(curs.fetchall(), dtype='f8')
		result = data[:,1] * data[:,2] / 5 / 400

		data = np.column_stack((np.where(np.isnan(result), None, np.round(result, 2)), data[:,0].astype('i8'))).tolist() 
		q = f'UPDATE events.{entity} SET vmbm = %s WHERE {entity}.id = %s'
		conn.cursor().executemany(q, data)
	
def compute_all():
	try:
		_compute_vmbm()
	except:
		log.error(f'Failed to compute other columns: {traceback.format_exc()}')
