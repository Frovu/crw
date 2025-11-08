from datetime import datetime
import time
import numpy as np

from database import log, pool, upsert_many
from data.neutron.core import filter_for_integration, integrate, select, fetch, obtain_many, update_result_table


def get_minutes(station, timestamp):
	if not station.provides_1min:
		return {}

	with pool.connection() as conn:
		curs = conn.execute(f'SELECT corrected FROM nm.{station.id}_1min ' + \
			'WHERE to_timestamp(%s) <= time AND time < to_timestamp(%s) + \'1 hour\'::interval ORDER BY time', [timestamp, timestamp])
		if not curs.rowcount:
			return {}
		raw = np.array(curs.fetchall(), 'f8')[:,0]

	filtered = filter_for_integration(np.copy(raw))
	integrated = integrate(np.copy(raw))

	return {
		'station': station.id,
		'raw': np.where(~np.isfinite(raw), None, raw).tolist(),
		'filtered': np.where(~np.isfinite(filtered), None, filtered).tolist(),
		'integrated': integrated if np.isfinite(integrated) else None
	}

def refetch(interval, stations):
	t0 = time.time()
	stids = [s.id for s in stations]
	old_data = np.array(select(interval, stids))
	obtain_many(interval, stations)
	new_data = np.array(select(interval, stids))

	ok = old_data.shape == new_data.shape
	counts = { s: (np.count_nonzero(old_data[:,i+1] != new_data[:,i+1]) if ok else -1) for i, s in enumerate(stids) }
	log.info(f'Neutron: completed refetch {",".join(stids)} {interval[0]}:{interval[1]}')

	return {
		'duration': time.time() - t0,
		'changeCounts': counts
	}

def fetch_rich(interval, stations):
	rows_rev, fields = fetch(interval, stations)
	if not len(rows_rev):
		return { 'revised': [] }
	t_from, t_to = rows_rev[0][0], rows_rev[-1][0]
	sids = [s.id for s in stations]
	with pool.connection() as conn:
		corrected = [np.array(conn.execute('SELECT corrected FROM generate_series(to_timestamp(%s), to_timestamp(%s), \'1 hour\'::interval) tm ' +\
			f'LEFT JOIN nm.{st}_1h ON time = tm', [t_from, t_to]).fetchall())[:,0] for st in sids]
		curs = conn.execute('SELECT * FROM neutron.revision_log WHERE rev_time[array_upper(rev_time, 1)] >= to_timestamp(%s) AND to_timestamp(%s) >= rev_time[1] ' +\
			'AND station = ANY(%s) ORDER BY time DESC', [t_from, t_to, sids])
		revisions = list()
		for row in curs.fetchall():
			rev = {desc[0]: row[i] for i, desc in enumerate(curs.description)}
			rev['time'] = rev['time'].timestamp()
			rev['reverted_at'] = rev['reverted_at'] and rev['reverted_at'].timestamp()
			rev['rev_time'] = [t.timestamp() for t in rev['rev_time']]
			revisions.append(rev)
	times = np.arange(t_from, t_to+1, 3600)

	return {
		'fields': fields,
		'corrected': np.column_stack([times, *corrected]).tolist(),
		'revised': rows_rev,
		'revisions': revisions
	}

def revision(author, comment, stationRevisions):
	with pool.connection() as conn:
		for sid in stationRevisions:
			revs = np.array(stationRevisions[sid], dtype='object')
			assert len(revs) > 0
			revs[:,0] = np.array([datetime.utcfromtimestamp(t) for t in revs[:,0]])
			log.info(f'Neutron: inserting revision of length {len(revs)} for {sid.upper()} around {revs[0,0]}')
			conn.execute('INSERT INTO neutron.revision_log (author, comment, station, rev_time, rev_value)' +\
				'VALUES (%s, %s, %s, %s, %s)', [author, comment, sid, revs[:,0].tolist(), revs[:,1].tolist()])
			upsert_many(f'{sid}_1h', ['time', 'revised'], revs.tolist(), schema='nm', write_nulls=True)
			update_result_table(conn, sid, [revs[0,0], revs[-1,0]])

def revert_revision(rid):
	with pool.connection() as conn:
		res = conn.execute('SELECT station, rev_time FROM neutron.revision_log WHERE id = %s', [rid]).fetchone()
		if res is None:
			raise ValueError('Not found')
		station, rev_time = res
		conn.execute(f'UPDATE nm.{station}_1h SET revised = NULL WHERE time = ANY(%s)', [rev_time])
		update_result_table(conn, station, [rev_time[0], rev_time[-1]])
		conn.execute('UPDATE neutron.revision_log SET reverted_at = CURRENT_TIMESTAMP WHERE id = %s', [rid])
		log.info(f'Neutron: reverted revision of length {len(rev_time)} for {station.upper()} around {rev_time[0]}')
