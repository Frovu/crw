from datetime import timedelta
from dataclasses import dataclass
import numpy as np
import ts_type

from database import pool, SQL, Identifier
from cream.gsm import normalize_variation
from events.columns.series import find_series
from events.columns.parser import columnParser, ColumnComputer, TYPE

HOUR = 3600

def epoch_collision(times: list[int], interval: list[int], ser_name: str):
	series = find_series(ser_name)

	with pool.connection() as conn:
		query = SQL(f'''SELECT array(
			SELECT {{}} FROM generate_series(to_timestamp(epoch) + %s, to_timestamp(epoch) + %s, '1 hour'::interval) tm
			LEFT JOIN {{}} ON time = tm {'AND NOT is_gle' if series.source == 'gsm' else ''}
		) FROM (select unnest(%s)) vals(epoch);''').format(Identifier(series.db_name), Identifier(series.table_name()))
		resp = conn.execute(query, [*[timedelta(hours=i) for i in interval], times]).fetchall()
		windows = np.array([r[0] for r in resp], dtype='f8')

	if series.name in ['a10', 'a10m']:
		windows = np.array([normalize_variation(w) for w in windows])

	offset = np.arange(windows.shape[1]) + interval[0]
	median = np.nanmedian(windows, axis=0)
	mean = np.nanmean(windows, axis=0)
	std = np.nanstd(windows, axis=0)

	return offset, median, mean, std

def custom_plot(interval: tuple[int, int], definitions: list[str], feid_id: int):
	interval = tuple(a // HOUR * HOUR + margin * HOUR for a, margin in zip(interval, [-24, 24])) # type: ignore
	computer = ColumnComputer(force_frame=interval, target_ids=[feid_id])
	time = [tm for tm in range(interval[0], interval[1]+1, HOUR)]
	results = [time]
	for definition in definitions:
		parsed = columnParser.parse(definition)
		result = computer.transform(parsed)
		res: np.ndarray = result.value

		if result.type != TYPE.SERIES:
			val = result.value if result.type == TYPE.LITERAL else result.value[0]
			val = None if ~np.isfinite(res) else val
			results.append([val for i in range(len(time))]) # type: ignore
			continue
	
		if len(res) != len(time):
			raise Exception(f'Length mismatch for {definition}: {len(res)} != {len(time)}')
		
		val = np.where(~np.isfinite(res), None, res).tolist() # type: ignore
		results.append(val)

	return results