import logging, json
from datetime import datetime
from database import pool
import statsmodels.api as sm
import numpy as np

HOUR = 3600
DAY = 24 * HOUR
log = logging.getLogger('crdt')

def _select(t_from, t_to, experiment, channel_name):
	fields = ['time', 'original', 'revised', 'pressure', 't_mass_average', 'a0', 'ax', 'ay', 'az']
	with pool.connection() as conn:
		exp_id, ch_id, corr_info = conn.execute(
			'''SELECT e.id, c.id, correction_info FROM muon.experiments e
			JOIN muon.channels c ON e.name = c.experiment
			WHERE e.name = %s AND c.name = %s''', [experiment, channel_name]).fetchone()
		res = conn.execute('''SELECT EXTRACT(EPOCH FROM c.time)::integer, original,
			NULLIF(COALESCE(revised, original), \'NaN\'), pressure, t_mass_average, a10, ax, ay, az
			FROM muon.counts_data c JOIN muon.conditions_data m
			ON m.experiment = %s AND c.channel = %s AND c.time = m.time
			JOIN gsm_result g ON g.time = c.time
			WHERE to_timestamp(%s) <= c.time AND c.time <= to_timestamp(%s)
			ORDER BY c.time''', [exp_id, ch_id, t_from, t_to]).fetchall()
	if len(res) < 1:
		return None, None
	all_data = np.array(res, 'f8')
	data = { f: all_data[:,i] for i, f in enumerate(fields) }

	time_of_day = (data['time'] + HOUR / 2) % DAY
	phi = 2 * np.pi * (time_of_day / DAY)
	ax_rotated = data['ax'] * np.cos(phi)	   + data['ay'] * np.sin(phi)
	ay_rotated = data['ax'] * np.sin(phi) * -1 + data['ay'] * np.cos(phi)
	data['ax'] = ax_rotated
	data['ay'] = ay_rotated
	return data, corr_info

def compute_coefficients(data):
	pres_data, tm_data = data['pressure'], data['t_mass_average']
	mask = np.where(~np.isnan(data['revised']) & ~np.isnan(data['a0']) & ~np.isnan(pres_data) & ~np.isnan(tm_data))
	if not np.any(mask):
		return None

	mean_pres, mean_tm = np.nanmean(pres_data), np.nanmean(tm_data)
	diff_pres, diff_tm = mean_pres - pres_data, mean_tm - tm_data
	series = [diff_pres, diff_tm, data['a0'], data['ax'], data['ay'], data['az']]
	regr_x = np.column_stack([ser[mask] for ser in series])
	regr_y = np.log(data['revised'][mask])

	with_intercept = np.column_stack((np.full(len(regr_x), 1), regr_x))
	ols = sm.OLS(regr_y, with_intercept)
	ols_result = ols.fit()
	names = ['p', 'tm', 'c0', 'cx', 'cy', 'cz']
	return {
		'coef': { name: ols_result.params[i + 1] for i, name in enumerate(names) },
		'error': { name: ols_result.bse[i + 1] for i, name in enumerate(names) },
		'length': np.count_nonzero(mask),
		'mean': {
			'pressure': mean_pres,
			't_mass_average': mean_tm
		}
	}

def get_local_coefficients(t_from, t_to, experiment, channel_name, fit):
	data, info = _select(t_from, t_to, experiment, channel_name)
	if not info or 'coef' not in info or fit not in ['all', 'gsm', 'axy']:
		return None

	if fit != 'all':
		diff_tm, diff_pres = (info['mean'][i] - data[i] for i in ['t_mass_average', 'pressure'])
		corrected = data['revised'] * (1 - info['coef']['p'] * diff_pres) * (1 - info['coef']['tm'] * diff_tm)
		mask = np.where(~np.isnan(corrected) & ~np.isnan(data['a0']))
		if not np.any(mask):
			return None

		snames = ['a0', 'ax', 'ay', 'az'] if fit == 'gsm' else ['ax', 'ay']
		cnames = ['c0', 'cx', 'cy', 'cz'] if fit == 'gsm' else ['cx', 'cy']

		regr_x = np.column_stack([data[i][mask] for i in snames])
		regr_y = np.log(corrected[mask])
		
		with_intercept = np.column_stack((np.full(len(regr_x), 1), regr_x))
		ols = sm.OLS(regr_y, with_intercept)
		ols_result = ols.fit()
		res = {
			'coef': { name: ols_result.params[i + 1] for i, name in enumerate(cnames) },
			'error': { name: ols_result.bse[i + 1] for i, name in enumerate(cnames) }
		}
	else:
		res = compute_coefficients(data)

	coef = res['coef']
	coef['c0'] = coef.get('c0', info['coef']['c0'])
	coef['cz'] = coef.get('cz', info['coef']['cz'])
	expected = (data['a0'] * coef['c0'] + data['az'] * coef['cz'] \
			  + data['ax'] * coef['cx'] + data['ay'] * coef['cy']) * 100
	return res, data['time'].tolist(), expected.tolist()

def select_with_corrected(t_from, t_to, experiment, channel_name, query):
	data, corr_info = _select(t_from, t_to, experiment, channel_name)
	if data is None:
		return [], []

	info = corr_info if corr_info and 'coef' in corr_info else compute_coefficients(data)
	coef = info['coef']

	data['expected'] = (data['a0'] * coef['c0'] + data['az'] * coef['cz'] \
					  + data['ax'] * coef['cx'] + data['ay'] * coef['cy']) * 100
	data['a0'] = data['a0'] * coef['c0'] * 100
	data['axy'] = np.hypot(data['ax'] * coef['cx'], data['ay'] * coef['cy'])

	diff_tm, diff_pres = (info['mean'][i] - data[i] for i in ['t_mass_average', 'pressure'])
	data['corrected'] = data['revised'] * (1 - coef['p'] * diff_pres) * (1 - coef['tm'] * diff_tm)
	
	if 'time' not in query:
		query = ['time'] + query
	fields = [f for f in query if f in data]
	result = np.column_stack([data[f] for f in fields])
	return np.where(np.isnan(result), None, np.round(result, 2)).tolist(), fields

def set_coefficients(req):
	experiment = req['experiment']
	channel = req['channel']
	action = req['action']
	with pool.connection() as conn:
		if action == 'reset':
			data, _ = _select(int(req['from']), int(req['to']), experiment, channel)
			info = compute_coefficients(data)
		elif action == 'update':
			info = conn.execute('SELECT correction_info FROM muon.channels ' +\
				'WHERE experiment = %s AND name = %s', [experiment, channel]).fetchone()[0]
			if not info:
				raise ValueError('Info is not set')
			info['coef']['p'] = req.get('p', info['coef']['p'])
			info['coef']['tm'] = req.get('tm', info['coef']['tm'])
			info['modified'] = True
		else:
			assert False
		info['time'] = int(datetime.now().timestamp())
		conn.execute('UPDATE muon.channels SET correction_info = %s WHERE experiment = %s AND name = %s',
			[json.dumps(info), experiment, channel])
			