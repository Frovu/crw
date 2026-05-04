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
	bases: list[int]

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

	required_len = int((t_to - t_from) / 3600)
	if len(data) < required_len:
		add_len = required_len - len(data) + 1
		data = np.concatenate((data, np.full((add_len, data.shape[1]), np.nan)))

	return data, stations
