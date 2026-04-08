import numpy as np
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from datetime import datetime, timezone

from database import pool, log, get_coverage, upsert_coverage, SQL, Identifier, CovergaeResponse
from data.omni.variables import OMNI_TABLE, GROUP, SOURCE, omni_variables, get_vars
from data.omni.obtain import obtain

obtain_lock = Lock()

def remove(interval: tuple[int, int], groups: list[GROUP]):
	col_names = [var.name for var in get_vars(groups)]
	with pool.connection() as conn:
		setters = SQL(',').join([SQL('{} = NULL').format(col) for col in col_names])
		query = SQL(f'UPDATE {OMNI_TABLE} SET {{}} WHERE to_timestamp(%s) <= time AND time <= to_timestamp(%s)').format(setters)
		curs = conn.execute(query, interval)
		return curs.rowcount
		
def insert(var, data):
	raise NotImplementedError()
	if not var in all_column_names:
		raise ValueError('Unknown variable: '+var)
	for row in data:
		row[0] = datetime.utcfromtimestamp(row[0])
	log.info(f'Omni: upserting from ui: [{len(data)}] rows from {data[0][0]} to {data[-1][0]}')
	upsert_many('omni', ['time', var], data, schema='public')

def select(interval: tuple[int, int], query: list[str]):
	all_column_names = [var.name for var in omni_variables]
	columns = [c for c in query if c in all_column_names]
	with pool.connection() as conn:
		cols = SQL(',').join([Identifier(c) for c in columns])
		curs = conn.execute(SQL(f'SELECT EXTRACT(EPOCH FROM time)::integer as time, {{}} FROM {OMNI_TABLE} ' +
			'WHERE to_timestamp(%s) <= time AND time <= to_timestamp(%s) ORDER BY time').format(cols), interval)
		data, fields = np.array(curs.fetchall(), dtype='object'), curs.description and [desc[0] for desc in curs.description]
	return (data, fields)

def ensure_prepared(interval: tuple[int, int], trust=False):
	t_start, t_end = interval
	with obtain_lock:
		if not trust:
			coverage = get_coverage(OMNI_TABLE)
			cov_start, cov_end, cov_at = [dt and int(dt.timestamp()) for dt in coverage[0]] if coverage else [None, None, None]
			if cov_start and cov_end and cov_at:
				if cov_start <= t_start and cov_end >= t_end:
					return CovergaeResponse(cov_start, cov_end, cov_at).to_dict()
				res_start = min(cov_start, t_start)
				fetch_start, fetch_end = cov_end if cov_start <= t_start else t_start, t_end
			else:
				res_start = fetch_start = t_start
				fetch_end = t_end
			log.info(f'Omni: beginning bulk fetch {datetime.fromtimestamp(fetch_start, timezone.utc)}:{datetime.fromtimestamp(fetch_end, timezone.utc)}')
			batch_size = 3600 * 24 * 1000
			with ThreadPoolExecutor(max_workers=4) as executor:
				for start in range(fetch_start, fetch_end+1, batch_size):
					end = start + batch_size
					interv = (start, end if end < fetch_end else fetch_end)
					executor.submit(obtain, interv, [g for g in GROUP], SOURCE.omniweb)
					executor.submit(obtain, interv, [GROUP.SWTY], SOURCE.SWTY)
			log.info('Omni: bulk fetch finished')
		else:
			res_start, fetch_end = interval
			log.info(f'Omni: force setting coverarge to {res_start}:{fetch_end}')

		upsert_coverage(OMNI_TABLE, res_start, fetch_end, single=True)
	return CovergaeResponse(res_start, fetch_end, int(datetime.now().timestamp())).to_dict()