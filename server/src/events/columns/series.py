from dataclasses import dataclass, asdict
from time import time
from typing import Literal
import numpy as np

from database import log
import data.omni.core as omni
from cream import gsm
import data.particles_and_xrays as sat

import ts_type

SSOURCE = Literal['omni', 'gsm', 'sat']
SDTYPE = Literal['real', 'str']

@ts_type.gen_type
@dataclass
class Series:
	source: SSOURCE
	name: str
	db_name: str
	display_name: str
	dtype: SDTYPE = 'real'

	def fetch(self, interval: list[int]) -> np.ndarray:
		t_data = time()

		if self.source == 'omni':
			omni.ensure_prepared(interval)
			res = omni.select(interval, [self.db_name])[0]
		elif self.source == 'sat':
			# TODO: sat.ensure_prepared
			res = sat.select_hourly_averaged(interval, self.db_name)
		else:
			res = gsm.select(interval, [self.db_name])

		arr = np.array(res, dtype='object' if self.name == 'sw_type' else 'f8')

		if len(arr) < 1:
			return arr
		
		if (arr[-1,0] - arr[0,0]) // 3600 - len(arr) > 1: # FIXME: data may shift by 1 hour ??
			log.error('Data is not continous for %s', self.name)
			raise BaseException('Data is not continous')
		
		log.debug(f'Got {self.display_name} [{len(arr)}] in {round(time()-t_data, 3)}s')
		return arr

	def as_dict(self):
		return asdict(self)

SERIES = [ # order matters (no it does not)
	Series('omni', 'v_sw', 'sw_speed', 'V'),
	Series('omni', 'd_sw', 'sw_density', 'D'),
	Series('omni', 't_sw', 'sw_temperature', 'T'),
	Series('omni', 't_idx', 'temperature_idx', 'Tidx'),
	Series('omni', 'imf', 'imf_scalar', 'B'),
	Series('omni', 'bx', 'imf_x', 'Bx'),
	Series('omni', 'by', 'imf_y', 'By'),
	Series('omni', 'bz', 'imf_z', 'Bz'),
	Series('omni', 'by_gsm', 'imf_y_gsm', 'By_gsm'),
	Series('omni', 'bz_gsm', 'imf_z_gsm', 'Bz_gsm'),
	Series('omni', 'beta', 'plasma_beta', 'beta'),
	Series('omni', 'dst', 'dst_index', 'Dst'),
	Series('omni', 'kp', 'kp_index', 'Kp'),
	Series('omni', 'ap', 'ap_index', 'Ap'),
	Series('omni', 'sw_type', 'sw_type', 'SW_type', dtype='str'),
	Series('gsm', 'a10m', 'a10m', 'A0m'),
	Series('gsm', 'a10', 'a10', 'A0'),
	Series('gsm', 'axy', 'axy', 'Axy'),
	Series('gsm', 'phi_axy', 'phi_axy', 'φ(Axy)'),
	Series('gsm', 'ax', 'ax', 'Ax'),
	Series('gsm', 'ay', 'ay', 'Ay'),
	Series('gsm', 'az', 'az', 'Az'),
	*[Series('sat', s, s, s[0]+' '+d) for s, d in sat.PARTICLES.items()],
	*[Series('sat', s, s, 'xra '+d) for s, d in sat.XRAYS.items()]
]

def find_series(name):
	found = next((s for s in SERIES if s.name == name), None)
	found = found or next((s for s in SERIES if s.display_name.lower() == name.lower()), None)

	if not found:
		raise Exception(f'Series not found: {name}')
	
	return found
