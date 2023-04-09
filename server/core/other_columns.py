from core.database import pool, log, tables_info
from core.generic_columns import apply_changes
import traceback
import numpy as np

def _compute_vmbm(entity='forbush_effects', column='vmbm'):
	with pool.connection() as conn:
		curs = conn.execute(f'SELECT id, v_max, b_max FROM events.{entity}')
		data = np.array(curs.fetchall(), dtype='f8')
		result = data[:,1] * data[:,2] / 5 / 400

		data = np.column_stack((np.where(np.isnan(result), None, np.round(result, 2)), data[:,0].astype('i8')))
		apply_changes(data[:,1], data[:,0], entity, column, conn)
		q = f'UPDATE events.{entity} SET {column} = %s WHERE {entity}.id = %s'
		conn.cursor().executemany(q, data.tolist())
	
def compute_all():
	try:
		_compute_vmbm()
	except:
		log.error(f'Failed to compute other columns: {traceback.format_exc()}')
