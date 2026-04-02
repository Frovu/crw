
from events.columns.column import Column, DTYPE as COL_DTYPE
from events.columns.computed_column import DATA_TABLE
from events.columns.series import Series
from events.table_structure import E_FEID, E_SOURCE_CH, ENTITY_CH, E_SOURCE_ERUPT, ENTITY_ERUPT, SOURCE_LINKS, get_col_by_name

from psycopg.sql import SQL, Identifier
from datetime import datetime, timezone
from database import pool, log
from time import time
import numpy as np

# margin in hours before first and after last event where series data will be available for computation
# since it should ideally be the same for all series, it cannot be determined dynamically
HOUR = 3600
SERIES_FRAME_MARGIN_H = 320
SERIES_FRAME_MARGIN_S = SERIES_FRAME_MARGIN_H * HOUR

SRC_COL_ORDERING_OPTIONS = [opt + desc for desc in ["", "_desc"] for opt in ['time', 'position', 'cme_speed'] ]
SRC_COL_ENTITY_OPTIONS = ['erupt', 'ch', *ENTITY_ERUPT, *ENTITY_CH]

def	np_dtype(dtype: COL_DTYPE):
	if dtype in ['text', 'enum']:
		return 'object'
	return 'f8'

class ComputationContext:
	def __init__(self, target_ids: list[int] | None = None) -> None:
		self.target_ids = target_ids
		self.cache: dict[str, np.ndarray] = {}
		self.series_frame: tuple[int, int] = None # type: ignore
	
	def get_slices(self, t_1: np.ndarray, t_2: np.ndarray):
		if not self.series_frame:
			return [slice(0, 0) for _ in t_1]
		t_0 = self.series_frame[0]
		t_l = np.minimum(t_1, t_2)
		t_r = np.maximum(t_1, t_2)
		left = (t_l - t_0) // HOUR
		slice_len = (t_r - t_l) // HOUR
		left[np.isnan(left)] = -1
		slice_len[left < 0] = 1
		slice_len[np.isnan(slice_len)] = 1
		return [np.s_[int(max(0, l)):int(max(0, l+sl))] for l, sl in zip(left, slice_len)]

	def select_columns(self, columns: list[Column]):
		to_fetch = [c for c in columns if c.sql_name not in self.cache]

		if to_fetch:
			cols = SQL(',').join([c.sql_val() for c in to_fetch])
			
			ids = self.target_ids
			select_query = SQL(f'SELECT {{}}\nFROM events.{E_FEID} fe LEFT JOIN events.{DATA_TABLE} cc '+\
				'ON feid_id = id {} ORDER BY time').format(cols, SQL('WHERE id = ANY(%s) ' if ids else ''))

			with pool.connection() as conn:
				curs = conn.execute(select_query, [ids] if ids else [])
				res = np.array(curs.fetchall())
			
			for i, c in enumerate(to_fetch):
				self.cache[c.sql_name] = res[:,i].astype(np_dtype(c.dtype))

		return [self.cache[c.sql_name] for c in columns]
	
	def select_series(self, series: Series):
		if series.name not in self.cache:
			frame = self.series_frame or self.get_series_frame()
			t_data = time()
			res = series.fetch(frame)
			res_time = res[:,0]

			holes = np.where(res_time[1:] - res_time[:-1] != 3600)[0]
			if len(holes):
				hole_tm = datetime.fromtimestamp(res_time[holes[0]] + 3600, timezone.utc) # type: ignore
				log.error('Data is not continous for %s at %s', series.name, hole_tm)
				raise Exception(f'Data is not continous for {series.name} at {hole_tm}')
			
			if self.series_frame:
				if self.series_frame[0] != res_time[0] or self.series_frame[-1] != res_time[-1]:
					log.error('Series frame mismatch for %s', series.name)
					raise Exception(f'Series frame mismatch for {series.name}')
			elif len(res) > 0:
				self.series_frame = (res_time[0], res_time[-1])

			log.debug(f'Got {series.display_name} [{len(res)}] in {round(time()-t_data, 3)}s')
			self.cache[series.name] = res[:,1]

		return self.cache[series.name]
	
	def select_source_column(self, entity: str, infl: list[str], column: Column|None=None, order: str|None=None, get_count=False):
		ids = self.select_columns_by_name(['id'])[0].tolist() # TODO: this can be optimized

		is_ch = E_SOURCE_CH == entity or entity in ENTITY_CH
		src_table = E_SOURCE_CH if is_ch else E_SOURCE_ERUPT
		src_id_col = 'ch_id' if is_ch else 'erupt_id'

		is_end_src = entity not in [E_SOURCE_CH, E_SOURCE_ERUPT]
		target_prefix = Identifier('tgt' if is_end_src else 'src')

		join_end_src = SQL('')
		if is_end_src:
			link_id_col, targ_id_col = SOURCE_LINKS[entity]
			join_end_src = SQL('LEFT JOIN events.{} tgt ON src.{} = tgt.{}')\
				.format(Identifier(entity), Identifier(link_id_col), Identifier(targ_id_col))
		else:
			targ_id_col = 'id'

		target_val = SQL('COUNT({}.{})').format(target_prefix, Identifier(targ_id_col)) if get_count else column and column.sql_val()

		order_by = SQL('') 
		if not get_count and order:
			if is_ch:
				order_sql = 'src.time'
			elif order.startswith('time'):
				order_sql = 'COALESCE(src.cme_time, src.flr_start)'
			elif order.startswith('position'):
				order_sql = '|/(src.lat^2 + src.lon^2)'
			elif order.startswith('cme_speed'):
				order_sql = 'src.cme_speed'
			else:
				assert not 'reached'
			order_by = SQL(f'ORDER BY {{}} {"DESC" if order.endswith('desc') else "ASC"} LIMIT 1').format(SQL(order_sql)) # type: ignore

		subquery = SQL(f'SELECT {{}} FROM events.feid_sources fsrc '+\
			f'LEFT JOIN events.{src_table} src ON src.id = {src_id_col} {{}} '+\
			'WHERE fsrc.feid_id = feid.id AND fsrc.cr_influence = ANY(%s) {}').format(target_val, join_end_src, order_by)
		query = SQL('SELECT ({}) FROM unnest(%s) AS feid(id)').format(subquery)

		with pool.connection() as conn:
			curs = conn.execute(query, [infl, ids])
			res = np.array(curs.fetchall())[:,0]
			return res.astype(np_dtype(column.dtype)) if column else res.astype('f8')

	def select_columns_by_name(self, names: list[str]):
		return self.select_columns([get_col_by_name(E_FEID, name) for name in names])
	
	def get_series_frame(self):
		times = self.select_columns_by_name(['time'])[0] // HOUR * HOUR
		return (int(times[0]) - SERIES_FRAME_MARGIN_S, int(times[-1]) + SERIES_FRAME_MARGIN_S)