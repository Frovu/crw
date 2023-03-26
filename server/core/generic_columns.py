from core.database import pg_conn
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

_init()

