from core.database import pg_conn
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import json

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
		return cls(None, None, None, None, None, desc['type'], desc['series'], desc.get('poi'), desc.get('shift'))

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
				self.pretty_name += f'{"+" if self.shift > 0 else "-"}{self.poi}'
		else:
			self.pretty_name = f'{series} {self.type.split("_")[-1]}'

def _init():
	with pg_conn.cursor() as cursor:
		cursor.execute('''CREATE TABLE IF NOT EXISTS events.generic_columns_info (
			created timestamp with time zone not null default CURRENT_TIMESTAMP,
			last_accesssed timestamp with time zone not null default CURRENT_TIMESTAMP,
			last_computed timestamp with time zone,
			entity text not null,
			author integer,
			type text not null,
			series text not null,
			poi text,
			shift integer,
			UNIQUE NULLS NOT DISTINCT (entity, type, series, poi, shift))''')
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

def select_generics():
	with pg_conn.cursor() as cursor:
		cursor.execute('SELECT * FROM events.generic_columns_info')
		rows = cursor.fetchall()
	cols = [desc[0] for desc in cursor.description]
	result = [GenericColumn(*row) for row in rows]
	return result


_init()
