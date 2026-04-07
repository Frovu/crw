import os, re
from dataclasses import dataclass
from enum import StrEnum

from database import pool, SQL, Identifier

OMNI_TABLE = 'omni'
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
	description: str = ''

	def __post_init__(self):
		if self.omniweb_name or self.omniweb_id:
			lines = omni_vars_text.splitlines()
			for i, line in enumerate(lines):
				if not line.strip(): continue
				spl = line.strip().split()
				owid = spl[0]
				if not owid.isdecimal(): continue
				owid, stub = int(owid), spl[2]
				bigspl = re.split(r'\s\s+', line[19:].strip())
				name = bigspl[0]
				if self.omniweb_id == owid or name == self.omniweb_name:
					self.omniweb_id = owid
					self.omniweb_stub = stub
					self.is_int = not '.' in stub
					desc = ' '.join(bigspl[1:])
					for di in range(i, len(lines)):
						dline = lines[di].strip()
						if not dline: continue
						if dline[:3].strip().isdecimal(): break
						desc += '\n' + dline.strip()
					self.description = (self.omniweb_name or '') + ', ' + desc
					break
			else:
				raise Exception(f'Failed to find omni column: {self.omniweb_name}')

	def as_dict(self):
		return { 'name': self.name, 'group': self.group and str(self.group.value).upper() }

omni_variables = [
	OmniVariable('KT', description='temperature index'),
	OmniVariable('SW_type', GROUP.SWTY, description='Yermolayev SW types'),
	OmniVariable('sc_id_imf', GROUP.IMF, omniweb_name='ID for IMF SC'),
	OmniVariable('sc_id_sw', GROUP.SW, omniweb_name='ID for SW Plasma SC'),
	# OmniVariable('count_imf', GROUP.IMF, omniweb_id=7),
	# OmniVariable('count_sw', GROUP.SW, omniweb_id=8),
	OmniVariable('B', GROUP.IMF, omniweb_name='Field Magnitude Avg,', crs_name='ibt'),
	OmniVariable('Bm', GROUP.IMF, omniweb_name='Magnitude of Average'),
	OmniVariable('Bx', GROUP.IMF, omniweb_name='Bx,GSE', crs_name='ibx'),
	OmniVariable('By', GROUP.IMF, omniweb_name='By,GSE', crs_name='iby'),
	OmniVariable('Bz', GROUP.IMF, omniweb_name='Bz,GSE', crs_name='ibz'),
	OmniVariable('By_gsm', GROUP.IMF, omniweb_name='By,GSM'),
	OmniVariable('Bz_gsm', GROUP.IMF, omniweb_name='Bz,GSM'),
	OmniVariable('V', GROUP.SW, omniweb_name='Bulk speed', crs_name='vsw'),
	OmniVariable('T', GROUP.SW, omniweb_name='Proton temperature', crs_name='tsw'),
	OmniVariable('D', GROUP.SW, omniweb_name='Proton density', crs_name='dsw'),
	OmniVariable('P', GROUP.SW, omniweb_name='Flow Pressure'),
	OmniVariable('NaNp', GROUP.SW, omniweb_name='Na/Np'),
	OmniVariable('Ef', GROUP.SW, omniweb_name='Electric field'),
	OmniVariable('Ma', GROUP.SW, omniweb_name='Alfven mach number'),
	OmniVariable('beta', GROUP.SW, omniweb_name='Plasma beta'),
	OmniVariable('Dst', GROUP.MAG, omniweb_name='DST Index', crs_name='dst'),
	OmniVariable('AE', GROUP.MAG, omniweb_name='AE-index'),
	OmniVariable('Kp', GROUP.MAG, omniweb_name='Kp*10', crs_name='kp'),
	OmniVariable('Ap', GROUP.MAG, omniweb_name='ap-index', crs_name= 'ap'),
	OmniVariable('PC', GROUP.MAG, omniweb_name='PC(N)'),
	OmniVariable('AL', GROUP.MAG, omniweb_name='AL-index'),
	OmniVariable('AU', GROUP.MAG, omniweb_name='AU-index'),
]
omni_vars_text = '' # free memory

def _init_db():
	with pool.connection() as conn:
		col_types = [SQL('TEXT' if c.name == 'sw_type' else 'SMALLINT' if c.is_int else 'REAL') for c in omni_variables]
		col_defs = [SQL('{} {}').format(Identifier(c.name), typ) for c, typ in zip(omni_variables, col_types)]
		conn.execute(SQL(f'CREATE TABLE IF NOT EXISTS {OMNI_TABLE} (\ntime TIMESTAMPTZ PRIMARY KEY, {{}})').format(SQL(',\n').join(col_defs)))
		for col in col_defs:
			conn.execute(SQL(f'ALTER TABLE {OMNI_TABLE} ADD COLUMN IF NOT EXISTS {{}}').format(col))
_init_db()

def get_vars(groups: list[GROUP], source: SOURCE | None = None):
	actual_groups = [group for group in groups if source in GROUP_SOURCES[group]] if source else groups
	if not len(actual_groups):
		raise Exception(f'Can\'t fetch these from {source and source.value}: ' + ','.join([str(g.value).upper() for g in groups]))
	return [var for var in omni_variables if var.group in actual_groups]