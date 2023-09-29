import numpy as np

def _kt_impl(t, v, vc=425):
	kt = np.empty(len(t))
	mask = v < vc 
	kt[mask] = t[mask] / (0.00017989 * np.exp(3.29 * np.log(v[mask])))
	mask = np.invert(mask)
	kt[mask] = t[mask] / (0.0964 * np.exp(2.25 * np.log(v[mask])))
	return kt

def _temperature_index(values, columns):
	t = values[:,columns.index('sw_temperature')].astype(float)
	v = values[:,columns.index('sw_speed')].astype(float)
	result = _kt_impl(t, v)
	return np.where(np.isnan(result), None, np.round(result, 3))

def compute_derived(data, columns):
	if 'sw_temperature' not in columns or 'sw_speed' not in columns:
		return data, columns
	data = np.array(data)
	time, values = data[:,0], data[:,1:]
	t_idx = _temperature_index(values, columns)
	res_cols =  columns + ['temperature_idx']
	return np.column_stack((time, values, t_idx)).tolist(), res_cols
