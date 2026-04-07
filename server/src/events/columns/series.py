from dataclasses import dataclass, asdict
from typing import Literal, Tuple
import numpy as np

import data.omni.query as omni
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
	display_name: str
	description: str = ''
	dtype: SDTYPE = 'real'

	def table_name(self):
		if self.source == 'omni':
			return 'omni'
		if self.source == 'gsm':
			return 'gsm_result'
		if self.source == 'sat':
			return sat.sat_table(self.name)
		return self.source

	def fetch(self, interval: tuple[int, int]) -> np.ndarray[Tuple[int, Literal[2]], np.dtype[np.float64]]:

		if self.source == 'omni':
			omni.ensure_prepared(interval)
			res = omni.select(interval, [self.name])[0]
		elif self.source == 'sat':
			# TODO: sat.ensure_prepared
			res = sat.select_hourly_averaged(interval, self.name)
		else:
			res = gsm.select(interval, [self.name])

		if len(res) < 1:
			return np.empty((0, 2)) # type: ignore
		
		return np.array(res, dtype=np.float64)

	def as_dict(self):
		return asdict(self)

SERIES = [ # order matters (no it does not)
	*[Series('omni', var.name, var.name, var.description, dtype='str' if var.name == 'SW_type' else 'real') for var in omni.omni_variables],
	Series('gsm', 'a10m', 'A0m'),
	Series('gsm', 'a10', 'A0'),
	Series('gsm', 'axy', 'Axy'),
	Series('gsm', 'phi_axy', 'φ(Axy)'),
	Series('gsm', 'ax', 'Ax'),
	Series('gsm', 'ay', 'Ay'),
	Series('gsm', 'az', 'Az'),
	*[Series('sat', s, s[0]+' '+d) for s, d in sat.PARTICLES.items()],
	*[Series('sat', s, 'xra '+d) for s, d in sat.XRAYS.items()]
]

def find_series(name: str):
	found = next((s for s in SERIES if s.name == name), None)
	found = found or next((s for s in SERIES if s.display_name.lower() == name.lower()), None)

	if not found:
		raise Exception(f'Series not found: {name}')
	
	return found
