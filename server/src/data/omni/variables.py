import os, re
from dataclasses import dataclass 
from enum import StrEnum

from database import pool, SQL, Identifier

GROUP = StrEnum('GROUP', ['SW', 'IMF', 'MAG', 'SWTY'])
SOURCE = StrEnum('SOURCE', ['omniweb', 'geomag', 'ACE', 'DISCOVR', 'SWTY'])
GROUP_SOURCES = {
	GROUP.SW: [SOURCE.omniweb, SOURCE.ACE, SOURCE.DISCOVR],
	GROUP.IMF: [SOURCE.omniweb, SOURCE.ACE, SOURCE.DISCOVR],
	GROUP.MAG: [SOURCE.omniweb, SOURCE.geomag],
	GROUP.SWTY: [SOURCE.SWTY]
}

omni_vars_path = os.path.join(os.path.dirname(__file__), './omni_variables.txt')
with open(omni_vars_path, encoding='utf-8') as file:
	omni_vars_text = file.read()

@dataclass
class OmniVariable():
	name: str
	group: GROUP | None = None
	omniweb_name: str | None = None
	omniweb_id: int | None = None
	omniweb_stub: str | None = None
	crs_name: str | None = None
	is_int: bool = False

	def __post_init__(self):
		if self.omniweb_name or self.omniweb_id:
			for line in omni_vars_text.splitlines():
				if not line.strip(): continue
				spl = line.strip().split()
				owid = spl[0]
				if not owid.isdecimal(): continue
				owid, stub = int(owid), spl[2]
				name = re.split(r'\s\s+', line[19:].strip())[0]
				if self.omniweb_id == owid or name == self.omniweb_name:
					self.omniweb_id = owid
					self.omniweb_stub = stub
					self.is_int = not '.' in stub
					break
			else:
				raise Exception(f'Failed to find omni column: {self.omniweb_name}')

omni_variables = [
	OmniVariable('temperature_idx'),
	OmniVariable('sw_type', GROUP.SWTY),
	OmniVariable('spacecraft_id_imf', GROUP.IMF, omniweb_name='ID for IMF SC'),
	OmniVariable('spacecraft_id_sw', GROUP.SW, omniweb_name='ID for SW Plasma SC'),
	# OmniVariable('count_imf', GROUP.IMF, omniweb_id=7),
	# OmniVariable('count_sw', GROUP.SW, omniweb_id=8),
	OmniVariable('imf_scalar', GROUP.IMF, omniweb_name='Field Magnitude Avg,', crs_name='ibt'),
	OmniVariable('imf_x', GROUP.IMF, omniweb_name='Bx,GSE', crs_name='ibx'),
	OmniVariable('imf_y', GROUP.IMF, omniweb_name='By,GSE', crs_name='iby'),
	OmniVariable('imf_z', GROUP.IMF, omniweb_name='Bz,GSE', crs_name='ibz'),
	OmniVariable('imf_y_gsm', GROUP.IMF, omniweb_name='By,GSM'),
	OmniVariable('imf_z_gsm', GROUP.IMF, omniweb_name='Bz,GSM'),
	OmniVariable('sw_temperature', GROUP.SW, omniweb_name='Proton temperature', crs_name='tsw'),
	OmniVariable('sw_density', GROUP.SW, omniweb_name='Proton density', crs_name='dsw'),
	OmniVariable('sw_speed', GROUP.SW, omniweb_name='Bulk speed', crs_name='vsw'),
	OmniVariable('plasma_beta', GROUP.SW, omniweb_name='Plasma beta'),
	OmniVariable('dst_index', GROUP.MAG, omniweb_name='DST Index', crs_name='dst'),
	OmniVariable('ae_index', GROUP.MAG, omniweb_name='AE-index'),
	OmniVariable('kp_index', GROUP.MAG, omniweb_name='Kp*10', crs_name='kp'),
	OmniVariable('ap_index', GROUP.MAG, omniweb_name='ap-index', crs_name= 'ap')
]
omni_vars_text = '' # free memory

def _init_db():
	with pool.connection() as conn:
		col_types = [SQL('TEXT' if c.name == 'sw_type' else 'SMALLINT' if c.is_int else 'REAL') for c in omni_variables]
		col_defs = [SQL('{} {}').format(Identifier(c.name), typ) for c, typ in zip(omni_variables, col_types)]
		conn.execute(SQL('CREATE TABLE IF NOT EXISTS omni (\ntime TIMESTAMPTZ PRIMARY KEY, {})').format(SQL(',\n').join(col_defs)))
		for col in col_defs:
			conn.execute(SQL('ALTER TABLE omni ADD COLUMN IF NOT EXISTS {}').format(col))
_init_db()

def get_vars(groups: tuple[GROUP], source: SOURCE):
	actual_groups = [group for group in groups if source in GROUP_SOURCES[group]]
	return [var for var in omni_variables if var.group in actual_groups]