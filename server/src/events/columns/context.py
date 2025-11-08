
from events.columns.column import Column, DTYPE as COL_DTYPE
from events.table_structure import E_FEID, SELECT_FEID, get_col_by_name

from psycopg.sql import SQL
from database import pool
import numpy as np

# margin in hours before first and after last event where series data will be available for computation
# since it should ideally be the same for all series, it cannot be determined dynamically
SERIES_FRAME_MARGIN_H = 320
SERIES_FRAME_MARGIN_S = SERIES_FRAME_MARGIN_H * 3600

def	np_dtype(dtype: COL_DTYPE):
	if dtype in ['text', 'enum']:
		return 'U'
	if dtype == 'time':
		return 'i8'
	return 'f8'

class ComputationContext:
	def __init__(self, target_ids: list[int] | None = None) -> None:
		self.target_ids = target_ids
		self.cache: dict[str, np.ndarray] = {}

	def select_columns(self, columns: list[Column]):
		to_fetch = [c for c in columns if c.sql_name not in self.cache]

		if to_fetch:
			cols = SQL(',').join([c.sql_val() for c in to_fetch])
			
			ids = self.target_ids
			select_query = SQL(f'SELECT {{}}\nFROM {SELECT_FEID} {{}} ORDER BY time') \
				.format(cols, 'WHERE id = ANY(%s) ' if ids else '')

			with pool.connection() as conn:
				curs = conn.execute(select_query, [ids] if ids else [])
				res = np.array(curs.fetchall())
			
			for i, c in enumerate(to_fetch):
				self.cache[c.sql_name] = res[:,i].astype(np_dtype(c.dtype))

		return [self.cache[c.sql_name] for c in columns]

	def select_columns_by_name(self, names: list[str]):
		return self.select_columns([get_col_by_name(E_FEID, name) for name in names])
	
	def get_series_frame(self):
		times = self.select_columns_by_name(['time'])[0]
		return [times[0] - SERIES_FRAME_MARGIN_S, times[-1] + SERIES_FRAME_MARGIN_S]