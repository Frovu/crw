import numpy as np
import ts_type

from data.neutron import core as database
from dataclasses import dataclass, asdict


@ts_type.gen_type
@dataclass
class RSMPlotResponse:
	time: list[int]
	variations: list[list[float | None]]
	stations: list[database.Station]
	base: int | None = None

	def as_dict(self):
		return asdict(self)

def filter_counts(data):
	base = np.nanmean(data, axis=0)
	variation = data / base
	std = np.nanstd(variation, axis=1)[:,None]
	med = np.nanmean(variation, axis=1)[:,None]
	dist = np.abs(med - variation) / std
	mask = np.where(dist > 3) # if dist to mean > 3 sigma
	data[mask] = np.nan

def fetch_counts(t_from: int, t_to: int):
	stations = database.get_stations(group_partial=True)
	data = database.fetch((t_from, t_to), stations)
	data = np.array(data, dtype=np.float64)			
	filter_counts(data[:,1:])
	return data, stations
