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

def filter_variations(data):
	std = np.nanstd(data, axis=1)[:,None]
	med = np.nanmean(data, axis=1)[:,None]
	dist = np.abs(med - data) / std
	mask = np.where(dist > 3) # if dist to mean > 3 sigma
	data[mask] = np.nan
	
	fl_ids, fl_counts = np.unique(mask[1], return_counts=True)
	max_errors = data.shape[0] // 10
	excluded = fl_ids[fl_counts > max_errors]
	data[:,excluded] = np.nan

def fetch_counts(t_from: int, t_to: int):
	stations = database.get_stations(group_partial=True)
	data = database.fetch((t_from, t_to), stations)
	data = np.array(data, dtype=np.float64)			
	return data, stations
