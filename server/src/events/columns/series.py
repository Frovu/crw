from dataclasses import dataclass, asdict
from typing import Literal
from data import particles_and_xrays as sat
import ts_type

import numpy as np

SSOURCE = Literal['omni', 'gsm', 'sat']

@ts_type.gen_type
@dataclass
class Series:
	source: SSOURCE
	name: str
	db_name: str
	display_name: str
	description: str = ''

	def fetch(self, interval: tuple[int, int]) -> np.ndarray:
		return np.array([])
	
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