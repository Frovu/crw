from math import floor, ceil
from threading import Lock
from datetime import datetime, timezone
from dataclasses import dataclass
import os
import numpy as np

from database import log, pool, upsert_many
from data.neutron.archive import obtain as obtain_from_archive
from data.neutron.nmdb import obtain as obtain_from_nmdb

NMDB_SINCE = datetime(2022, 1, 1).replace(tzinfo=timezone.utc).timestamp()
HOUR = 3600
MAX_OBTAIN_LENGTH = 31 * 24 * HOUR
MIN_MINUTES = 20
obtain_mutex = Lock()
integrity_full = [None, None]
integrity_partial = [None, None]
all_stations = []

@dataclass
class Station:
	id: str
	drift_longitude: float
	provides_1min: bool
	prefer_nmdb: bool

def _init():
	global integrity_full, integrity_partial, all_stations
	with open(os.path.join(os.path.dirname(__file__), './_init_db.sql'), encoding='utf-8') as file:
		init_text = file.read()
	with pool.connection() as conn:
		conn.execute(init_text)
		rows = conn.execute('SELECT id, drift_longitude, provides_1min, prefer_nmdb FROM neutron.stations').fetchall()
		all_stations = [Station(*r) for r in rows]
		for s in all_stations:
			conn.execute(f'ALTER TABLE neutron.result ADD COLUMN IF NOT EXISTS {s.id} REAL')
			conn.execute(f'CREATE TABLE IF NOT EXISTS nm.{s.id}_1h (time TIMESTAMPTZ PRIMARY KEY, corrected REAL, revised REAL)')
			if not s.provides_1min: continue
			conn.execute(f'CREATE TABLE IF NOT EXISTS nm.{s.id}_1min (time TIMESTAMPTZ PRIMARY KEY, corrected REAL)')
		ff, ft, pf, pt = conn.execute('SELECT full_from, full_to, partial_from, partial_to FROM neutron.integrity_state').fetchone()
		integrity_full, integrity_partial = [ff, ft], [pf, pt]
_init()

def _save_integrity_state():
	with pool.connection() as conn:
		conn.execute('UPDATE neutron.integrity_state SET full_from=%s, full_to=%s, partial_from=%s, partial_to=%s', [*integrity_full, *integrity_partial])

def filter_for_integration(data):
	data[data <= 0] = np.nan
	std = np.nanstd(data)
	med = np.nanmean(data)
	data[np.abs(med - data) / std > 3] = np.nan
	return data

def integrate(data):
	data = filter_for_integration(data)
	count = np.count_nonzero(np.isfinite(data))
	if count < MIN_MINUTES:
		return np.nan
	return np.round(np.nansum(data) / count, 3)

def _obtain_similar(interval, stations, source):
	if source == 'nmdb' and interval[1] - interval[0] > MAX_OBTAIN_LENGTH:
		log.debug(f'Neutron: splitting obtain interval of len {int((interval[1] - interval[0]) / HOUR)} (> {MAX_OBTAIN_LENGTH / HOUR})')
		i = interval[0]
		while i < interval[1]:
			last = i + MAX_OBTAIN_LENGTH > interval[1]
			to = interval[1] if last else i + MAX_OBTAIN_LENGTH - HOUR
			_obtain_similar([i, to], stations, source)
			i = to if last else to + HOUR
		return

	obtain_fn, src_res = { 'nmdb': (obtain_from_nmdb, 60), 'archive': (obtain_from_archive, 3600) }[source]
	src_data = obtain_fn(interval, stations)
	if not src_data:
		log.warning(f'Empty obtain ({source}) {stations} {interval[0]}:{interval[1]}')
		return # FIXME: handle smh
	
	src_data = np.array(src_data)

	res_dt_interval = [src_data[0][0], src_data[-1][0]]
	log.debug(f'Neutron: got [{len(src_data)} * {len(stations)}] /{src_res}')

	if src_res < HOUR:
		r_start, r_end = [d.replace(tzinfo=timezone.utc).timestamp() for d in res_dt_interval]
		first_full_h, last_full_h = ceil(r_start / HOUR) * HOUR, floor((r_end + src_res) / HOUR) * HOUR - HOUR
		length = (last_full_h - first_full_h) // HOUR + 1
		data = np.full((length, len(stations)+1), 'o', src_data.dtype)
		data[:,0] = [datetime.utcfromtimestamp(t) for t in range(first_full_h, last_full_h+1, HOUR)]
		step = floor(HOUR / src_res)
		offset = floor((first_full_h - r_start) / src_res)
		for si in range(len(stations)):
			integrated = (integrate(src_data[offset+i*step:offset+(i+1)*step,si+1].astype(float)) for i in range(length))
			result = np.fromiter(integrated, 'f8')
			data[:,si+1] = np.where(~np.isfinite(result), None, result)
	else:
		data = src_data
		data[:,1:] = np.where(data[:,1:] <= 0, None, data[:,1:])

	log.debug(f'Neutron: obtained {source} [{len(data)} * {len(stations)}] {res_dt_interval[0]} to {res_dt_interval[1]}')
	with pool.connection() as conn:
		for i, station in enumerate(stations):
			upsert_many(f'nm.{station}_1h', ['time', 'corrected'],
				np.column_stack((data[:,0], data[:,1+i])).tolist(), write_nulls=True) # FIXME: should we really write_nulls?
			if src_res == 60:
				upsert_many(f'nm.{station}_1min', ['time', 'corrected'],
					np.column_stack((src_data[:,0], src_data[:,1+i])).tolist())
			else:
				assert src_res == HOUR
			update_result_table(conn, station, res_dt_interval)
		conn.execute('INSERT INTO neutron.obtain_log(stations, source, interval_start, interval_end) ' +\
			'VALUES (%s, %s, %s, %s)', [stations, source, *res_dt_interval])

def update_result_table(conn, station, dt_interval):
	conn.execute(f'INSERT INTO neutron.result(time, {station}) ' + \
		'SELECT time, CASE WHEN COALESCE(c.revised, c.corrected) <= 0 THEN NULL ELSE COALESCE(c.revised, c.corrected) END ' +\
		f'FROM nm.{station}_1h c WHERE %s <= time AND time <= %s ' +\
		f'ON CONFLICT(time) DO UPDATE SET {station} = EXCLUDED.{station}', [*dt_interval])

def get_stations(group_partial=False, ids=False):
	# TODO: another criteria
	return [(s.id if ids else s) for s in all_stations]

def resolve_station(name: str) -> Station:
	return next((s for s in all_stations if s.id.lower().startswith(name.lower())), None)

def obtain_many(interval, stations: list[Station]):
	if interval[0] < NMDB_SINCE and NMDB_SINCE <= interval[1]:
		obtain_many((interval[0], NMDB_SINCE-HOUR), stations)
		obtain_many((NMDB_SINCE, interval[1]), stations)
		return log.debug('Neutron: split interval with NMDB_SINCE')

	nmdb_stations = [s.id for s in stations if s.prefer_nmdb] if interval[0] >= NMDB_SINCE else []
	if nmdb_stations:
		_obtain_similar(interval, nmdb_stations, 'nmdb')
	
	other_stations = [s.id for s in stations if s.id not in nmdb_stations]
	for s in other_stations:
		_obtain_similar(interval, [s], 'archive')

def select(interval, station_ids, description=False):
	with pool.connection() as conn:
		curs = conn.execute(f'SELECT EXTRACT(EPOCH FROM time)::integer as time, {",".join(station_ids)} ' + \
			'FROM neutron.result WHERE to_timestamp(%s) <= time AND time <= to_timestamp(%s) ORDER BY time', [*interval])
		return (curs.fetchall(), ['time', *station_ids]) if description else curs.fetchall()

def fetch(interval: [int, int], stations: list[Station]):
	interval = (
		floor(max(interval[0], datetime(1957, 1, 1).timestamp()) / HOUR) * HOUR,
		 ceil(min(interval[1], datetime.now().timestamp() - 2*HOUR) / HOUR) * HOUR
	)
	group_partial = True # TODO: actually distinguish full and partial integrity
	global integrity_partial, integrity_full

	with obtain_mutex:
		ips, ipe = integrity_partial if group_partial else integrity_full
		satisfied = ips and ipe and ips <= interval[0] and interval[1] <= ipe 

		if not satisfied:
			req = (
				ipe if ipe and interval[0] >= ips else interval[0],
				ips if ips and interval[1] <= ipe else interval[1]
			)
			obtain_stations = get_stations(group_partial) # FIXME: ?
			obtain_many(req, obtain_stations)
			res_coverage = [min(interval[0], ips or interval[0]), max(ipe or interval[1], interval[1])]
			if group_partial:
				integrity_partial = res_coverage
			else:
				integrity_full = res_coverage
			_save_integrity_state()
	
	return select(interval, [s.id for s in stations], True)