import traceback
import numpy as np

from events.columns.parser import ColumnComputer
from events.table_structure import E_FEID
from database import pool, upsert_many

DEFAULT_DURATION = 72

def compute_and_upsert_duration(target_ids: list[int] | None = None):
	try:
		computer = ColumnComputer(target_ids=target_ids)
		ids, time, src_dur = computer.ctx.select_columns_by_name(['id', 'time', 'duration'])
		hours = time // 3600

		t_after = np.empty_like(hours)
		t_after[:-1] = hours[1:] - hours[:-1]
		t_after[-1] = 9999
		src_dur[src_dur < 1] = DEFAULT_DURATION
		duration = np.minimum(src_dur, t_after)

		data = np.column_stack((ids, duration)).astype(int)
		upsert_many(E_FEID, ['id', 'duration'], data, only_update=True)
		
	except Exception as e:
		traceback.print_exc()
		return e
