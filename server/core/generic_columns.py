from core.database import pg_conn
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from math import floor, ceil
from concurrent.futures import ThreadPoolExecutor
import data_series.omni.database as omni
import data_series.gsm.database as gsm
import json, logging
import numpy as np
import psycopg2.extras

log = logging.getLogger('aides')

PERIOD = 3600
RANGE_LEFT =  24 * PERIOD
RANGE_RIGHT = 48 * PERIOD

SERIES = {
	"sw_speed": ["omni", "V"],
	"sw_density": ["omni", "D"],
	"sw_temp": ["omni", "T"],
	"temperature_idx": ["omni", "Tidx"],
	"imf_scalar": ["omni", "B"],
	"imf_x": ["omni", "Bx"],
	"imf_y": ["omni", "By"],
	"imf_z": ["omni", "Bz"],
	"plasma_beta": ["omni", "beta"],
	"dst_index": ["omni", "Dst"],
	"kp_index": ["omni", "Kp"],
	"ap_index": ["omni", "Ap"],
	"A10": ["gsm", "A10"],
	"Ax": ["gsm", "Ax"],
	"Ay": ["gsm", "Ay"],
	"Az": ["gsm", "Az"],
	"Axy": ["gsm", "Axy"],
}

@dataclass
class GenericColumn:
	id: int
	created: datetime
	last_accesssed: datetime
	last_computed: datetime
	entity: str
	author: int
	type: str # min, max, abs_max, abs_min, moment, 
	series: str
	poi: str
	shift: int
	name: str = None
	pretty_name: str = None

	@classmethod
	def from_config(cls, desc):
		return cls(None, None, None, None, None, None, desc['type'], desc['series'], desc.get('poi'), desc.get('shift'))

	def __post_init__(self):
		name = f'g_{self.type}_{self.series}'
		if self.poi: name += f'_{self.poi}'
		if self.shift: name += f'_{abs(int(self.shift))}{"b" if self.shift < 0 else "a"}'
		self.name = name.lower()

		series = SERIES[self.series][1]
		if 'abs' in self.type:
			series = f'abs({series})'
		if self.type == 'moment':
			self.pretty_name = f'{series} at {self.poi}'
			if self.shift and self.shift != 0:
				self.pretty_name += f'{"+" if self.shift > 0 else "-"}{abs(int(self.shift))}h'
		else:
			self.pretty_name = f'{series} {self.type.split("_")[-1]}'

def _init():
	with pg_conn.cursor() as cursor:
		cursor.execute('''CREATE TABLE IF NOT EXISTS events.generic_columns_info (
			id serial primary key,
			created timestamp with time zone not null default CURRENT_TIMESTAMP,
			last_accesssed timestamp with time zone not null default CURRENT_TIMESTAMP,
			last_computed timestamp with time zone,
			entity text not null,
			author integer,
			type text not null,
			series text not null,
			poi text not null default '',
			shift integer not null default 0,
			UNIQUE (entity, type, series, poi, shift))''')
		path = Path(__file__, '../../config/tables_generics.json').resolve()
		with open(path) as file:
			generics = json.load(file)
		for table in generics:
			for generic in generics[table]:
				cursor.execute(f'''INSERT INTO events.generic_columns_info (entity,author,{",".join(generic.keys())})
					VALUES (%s,%s,{",".join(["%s" for i in generic])})
					ON CONFLICT (entity, type, series, poi, shift) DO NOTHING''', [table, -1] + list(generic.values()))
				col_name = GenericColumn.from_config(generic).name
				cursor.execute(f'ALTER TABLE events.{table} ADD COLUMN IF NOT EXISTS {col_name} REAL')
		pg_conn.commit()
_init()

def select_generics():
	with pg_conn.cursor() as cursor:
		cursor.execute('SELECT * FROM events.generic_columns_info ORDER BY id')
		rows = cursor.fetchall()
	cols = [desc[0] for desc in cursor.description]
	result = [GenericColumn(*row) for row in rows]
	return result

def _select(t_from, t_to, series):
	if SERIES[series][0] == 'omni':
		return omni.select([t_from, t_to], [series])[0]
	else:
		return gsm.select([t_from, t_to], series)[0]

def compute_generic(events, generic):
	with pg_conn.cursor() as cursor:
		try:
			log.info(f'Computing {generic.name} for {generic.entity}')
			result = np.full(len(events), None, dtype=object)
			if generic.type == 'moment':
				for i in range(len(result)):
					hours = events[i][1] / PERIOD + generic.shift
					moment = (ceil(hours) if generic.shift > 0 else floor(hours)) * PERIOD
					if generic.poi == 'onset':
						res = _select(moment, moment, generic.series)
						result[i] = res[0][1] if len(res) else None
					else:
						assert False
			elif generic.type in ['min', 'max', 'abs_min', 'abs_max']:
				for i in range(len(result)):
					# b_prev = None if i < 1 else ceil(events[i-1][1] / PERIOD)
					time = floor(events[i][1] / PERIOD) * PERIOD
					bound_right = time + RANGE_RIGHT
					if i < len(result) - 1:
						bound_event = (floor(events[i+1][1] / PERIOD) - 1) * PERIOD
						bound_right = min(bound_right, bound_event)
					data = np.array(_select(time, bound_right, generic.series), dtype=np.float64)
					if not len(data): continue
					target = np.abs(data[:,1]) if 'abs' in generic.type else data[:,1]
					if not np.isnan(target).all():
						result[i] = np.nanmax(target) if 'max' in generic.type else np.nanmin(target)
			else:
				assert False
			
			if generic.series == 'kp_index':
				result[result != None] /= 10

			q = f'UPDATE events.{generic.entity} SET {generic.name} = data.val FROM (VALUES %s) AS data (id, val) WHERE {generic.entity}.id = data.id'
			psycopg2.extras.execute_values(cursor, q, np.column_stack((events[:,0], result)), template='(%s, %s::real)')
			cursor.execute('UPDATE events.generic_columns_info SET last_computed = CURRENT_TIMESTAMP WHERE id = %s', [generic.id])
			log.info(f'Computed {generic.name} for {generic.entity}')
		except Exception as e:
			 log.info(f'Failed at {generic.name}: {e}')


def compute_generics(generics: [GenericColumn]):
	with pg_conn.cursor() as cursor:
		cursor.execute('SELECT id, time FROM events.default_view ORDER BY time')
		events = np.array(cursor.fetchall())
		omni.ensure_prepared([events[0][1] - 24 * PERIOD, events[-1][1] + 48 * PERIOD])
	with ThreadPoolExecutor() as executor:
		for generic in generics:
			executor.submit(compute_generic, events, generic)
	pg_conn.commit()
		
def init_generics():
	gs = select_generics()
	# FIXME: what days wtf
	compute_generics([g for g in gs if g.last_computed is None])