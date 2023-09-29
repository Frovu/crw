
import os, time, logging
from threading import Thread, Lock
from datetime import datetime
import numpy as np

from database import pool, upsert_many
from data.meteo import ncep
from data.muon.obtain_raw import obtain as obtain_raw

log = logging.getLogger('crdt')

obtain_mutex = Lock()
obtain_status = { 'status': 'idle' }

def _init():
	with open(os.path.join(os.path.dirname(__file__), './_init_db.sql'), encoding='utf-8') as file:
		init_text = file.read()
	with pool.connection() as conn:
		conn.execute(init_text)
_init()

def select_experiments():
	with pool.connection() as conn:
		exps = conn.execute('SELECT name, lon, operational_since, operational_until FROM muon.experiments ORDER BY id').fetchall()
		chas = conn.execute('SELECT name, experiment, correction_info FROM muon.channels ORDER BY id').fetchall()
	result = []
	for experiment, lon, since, until in exps:
		channels = [{ 'name': nm, 'correction': corr } for nm, exp, corr in chas if exp == experiment]
		result.append({
			'name': experiment,
			'longitude': lon,
			'since': since.timestamp(),
			'until': until and until.timestamp(),
			'channels': channels
		})
	return result

def _do_obtain_all(t_from, t_to, experiment, partial):
	global obtain_status
	try:
		with pool.connection() as conn:
			obtain_status = { 'status': 'busy' }
			row = conn.execute('SELECT id, lat, lon, operational_since, operational_until ' + \
				'FROM muon.experiments e WHERE name = %s', [experiment]).fetchone()
			if row is None:
				raise ValueError(f'Experiment not found: {experiment}')
			exp_id, lat, lon, since, until = row
			t_from = max(int(since.timestamp()), t_from)
			t_to   = min(int(until.timestamp()), t_to) if until is not None else t_to
			if t_to - t_from < 86400:
				raise ValueError('Interval too short (out of bounds?)')

			if not partial:
				obtain_status['message'] = 'obtaining temperature..'
				while True:
					progress, result = ncep.obtain([t_from, t_to], lat, lon)
					obtain_status['downloading'] = progress
					if progress is None:
						break
					time.sleep(.1)
				if result is None:
					raise ValueError('NCEP returned None')
				t_m = result[:,1]
				times = np.array([datetime.utcfromtimestamp(t) for t in result[:,0]])
				data = np.column_stack((times, np.where(np.isnan(t_m), None, t_m))).tolist()
				upsert_many('muon.conditions_data', ['experiment', 'time', 't_mass_average'],
					data, constants=[exp_id], conflict_constraint='time,experiment', conn=conn)
			
			obtain_status['message'] = 'obtaining pressure..'
			data = obtain_raw(t_from, t_to, experiment, 'pressure')
			upsert_many('muon.conditions_data', ['experiment', 'time', 'pressure'],
				data, constants=[exp_id], conflict_constraint='time, experiment', conn=conn)
			
			obtain_status['message'] = 'obtaining counts..'
			channels = conn.execute('SELECT id, name FROM muon.channels WHERE experiment = %s', [experiment]).fetchall()
			for ch_id, ch_name in channels:
				obtain_status['message'] = 'obtaining counts: ' + ch_name
				data = obtain_raw(t_from, t_to, experiment, ch_name)
				upsert_many('muon.counts_data', ['channel', 'time', 'original'],
					data, constants=[ch_id], conflict_constraint='time, channel', conn=conn)

			obtain_status = { 'status': 'ok' }

	except BaseException as err:
		log.error('Failed muones obtain_all: %s', str(err))
		obtain_status = { 'status': 'error', 'message': str(err) }
		raise err

def obtain_all(t_from, t_to, experiment, partial):
	global obtain_status
	with obtain_mutex:
		if obtain_status['status'] != 'idle':
			saved = obtain_status
			if obtain_status['status'] in ['ok', 'error']:
				obtain_status = { 'status': 'idle' }
			return saved

		obtain_status = { 'status': 'busy' }
		Thread(target=_do_obtain_all, args=(t_from, t_to, experiment, partial)).start()
		time.sleep(.1) # meh
		return obtain_status

def do_revision(t_from, t_to, experiment, channel, action):
	if action not in ['remove', 'revert']:
		raise BaseException('Action not implemented: '+str(action))
	with pool.connection() as conn:
		conn.execute('UPDATE muon.counts_data SET revised = %s ' +\
			'WHERE to_timestamp(%s) <= time AND time <= to_timestamp(%s) AND ' +\
			'channel = (SELECT id FROM muon.channels WHERE experiment = %s AND name = %s)',
			[np.nan if action == 'remove' else None, t_from, t_to, experiment, channel])
