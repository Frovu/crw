from datetime import datetime, timezone
import json
import numpy as np
import requests

def select_muon_corrected(dt_from, dt_to, experiment='Moscow-pioneer', query=['revised', 'corrected']):
    '''Fetches muon experiments data from temperature correction server.
    Parameters:
        dt_from (datetime): interval start (inclusive)
        dt_to (datetime): interval end (inclusive)
        experiment (str): choose experimnt from: Moscow-pioneer, Apatity, Barentsburg, Moscow-CUBE, etc
        query (list(str)): specify which data should be retrieved from:
            original - raw counts
            revised - manually corrected raw counts
            corrected - corrected for pressure and temperature
            pressure - self explanatory
            t_mass_average - self explanatory
            expected - expected variation based on GSM
            a0, ax, ay, az - GSM components
	Returns:
		np.ndarray where first column contains datetime and the others contain queried params in order'''
    tfr, tto = [int(d.replace(tzinfo=timezone.utc).timestamp()) for d in (dt_from, dt_to)]
    uri = f'https://tools.izmiran.ru/w/api/muon/?from={tfr}&to={tto}&experiment={experiment}&query={",".join(query)}'
    res = requests.get(uri, verify=False, timeout=10000)
    if res.status_code != 200:
        print(f'request failed: {res.status_code}')
        return None
    body = json.loads(res.text)
    data = np.array(body.get('rows'), dtype='object')
    data[:,0] = [datetime.fromtimestamp(d, tz=timezone.utc) for d in data[:,0]]
    return data