
from events.source import cactus_cme, donki, lasco_cme, noaa_flares, r_c_icme, solardemon, solarsoft, solen_info
from events.columns.column import Column as Col

# FIXME: remove noaa flares
SELECT_FEID = 'events.feid LEFT JOIN events.generic_data ON id = feid_id LEFT JOIN events.legacy_noaa_flares fl ON fl.start_time = flr_time'

E_FEID = 'feid'
FEID = [
	Col(E_FEID, 'id', dtype='integer', sql_def='SERIAL PRIMARY KEY'),
	Col(E_FEID, 'time', 'Event onset time',
		sql_def='timestamptz NOT NULL UNIQUE',
		not_null=True,
		dtype='time',
		parse_name='Time'),
	Col(E_FEID, 'duration', 'Effective event duration, hours',
		not_null=True,
		is_computed=True,
		dtype='integer',
		parse_name='Te'),
	Col(E_FEID, 'onset_type', 'ons type', 'Onset time origin: SSC; SI - Sudden impulse, ground data; iSW - satellite data',
		dtype='enum',
		enum=['SSC', 'iSW', 'SI'],
		parse_name='OType',
		parse_value={'1': 'SSC', '2': 'iSW', '3': 'SI', '9': None}),
	Col(E_FEID, 's_type', 'src type', 'Solar source index (it\'s complicated),',
		dtype='real',
		parse_name='SType'),
	Col(E_FEID, 's_description', 'src info', 'Solar source description',
		dtype='text',
		parse_name='Source'),
	Col(E_FEID, 's_confidence', 'src conf', 'Overall source determination confidence',
		dtype='enum',
		enum=['low', 'avg', 'high'],
		parse_name='Qs',
		parse_value={'3': 'low', '4': 'avg', '5': 'high'}),
	Col(E_FEID, 'old_magnitude', '_magnitude', '(AB), FD magnitude as maximum 10 GV CR density variation obtained using GSM corrected for magnetospheric effect using the Dst-index',
		parse_name='MagnM'),
	Col(E_FEID, 'gamma', '(AB), rigidity spectrum exponent during the hour of minimum CR density',
		parse_name='GammaM'),
	Col(E_FEID, 'vmbm', 'VmBm',  'Vmax / 400 * Bmax / 5',
		is_computed=True),

	Col(E_FEID, 'base_period', 'base', '24-h base period start',
	  	dtype='time'),

	Col(E_FEID, 'pre_increase', 'pre incr', '0 - no pre-increse, 1 - questionable, 2 - confident'),
	Col(E_FEID, 'pre_inc_width', 'p-inc width', 'Average longitudinal width of the pre-increase'),
	Col(E_FEID, 'pre_inc_direction', 'p-inc lon', 'Longitude of the pre-increase maximum'),
	Col(E_FEID, 'pre_inc_duration', 'p-inc dur', 'Pre-increase duration in hours'),
	Col(E_FEID, 'pre_inc_magnitude', 'p-inc magn', 'Pre-increase magnitude according to RSM'),
		
	Col(E_FEID, 'pre_decrease', 'pre decr', '0 - no pre-decrese, 1 - questionable, 2 - confident'),
	Col(E_FEID, 'pre_dec_width', 'p-dec width', 'Average longitudinal width of the pre-decrease'),
	Col(E_FEID, 'pre_dec_direction', 'p-dec lon', 'Longitude of the pre-decrease maximum'),
	Col(E_FEID, 'pre_dec_duration', 'p-dec dur', 'Pre-decrease duration in hours'),
	Col(E_FEID, 'pre_dec_magnitude', 'p-dec magn', 'Pre-decrease magnitude according to RSM'),


	Col(E_FEID, 'comment', dtype='text', description='Additional information'),

	Col(E_FEID, 'mc_time', 'MC time', dtype='time', parse_name='MCStartTime'),
	Col(E_FEID, 'mc_duration', 'MC duration', parse_name='MCDur'),
	Col(E_FEID, 'mc_originator', 'MC originator', dtype='integer', parse_name='MC'),
	Col(E_FEID, 'mc_size', 'MC size', parse_name='RMC'),

	Col(E_FEID, 'cme_time', 'CME time', 'CME time (legacy)',
		dtype='time',
		parse_name='CMETime'),
	Col(E_FEID, 'cme_legacy_v0', 'Vmean0', 'Vmean0 (legacy)',
		parse_name='VMean0'),
	Col(E_FEID, 'flr_time', 'flare time', 'Flare start time (legacy)',
		dtype='time',
		parse_name='STime'),
]

E_FEID_SOURCE = E_SRC = 'feid_sources'
FEID_SOURCE = [
	Col(E_SRC, 'id', dtype='integer', sql_def='SERIAL PRIMARY KEY'),
	Col(E_SRC, 'feid_id',  dtype='integer', sql_def='integer NOT NULL REFERENCES events.feid ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED'),
	Col(E_SRC, 'ch_id',    dtype='integer', sql_def='integer REFERENCES events.sources_ch    ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED'),
	Col(E_SRC, 'erupt_id', dtype='integer', sql_def='integer REFERENCES events.sources_erupt ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED'),

	Col(E_SRC, 'cr_influence', dtype='enum', enum=['primary', 'secondary', 'residual']),
]

ENTITY_ERUPT = ['solarsoft_flares', 'donki_flares', 'legacy_noaa_flares', 'lasco_cmes', 'cactus_cmes', 'donki_cmes', 'r_c_icmes']
ENTITY_CH = ['solen_holes']

E_SOURCE_ERUPT = E_ER = 'sources_erupt'
SOURCE_ERUPT = [
	Col(E_ER, 'id', dtype='integer', sql_def='SERIAL PRIMARY KEY'),
	Col(E_ER, 'flr_start', 'XF start', dtype='time'),
	Col(E_ER, 'flr_peak', 'XF peak', dtype='time'),
	Col(E_ER, 'flr_end', 'XF end', dtype='time'),
	Col(E_ER, 'flr_flux', 'XF flux'),
	Col(E_ER, 'active_region', 'AR', dtype='integer'),
	Col(E_ER, 'flr_source', 'XF src',
		dtype='enum',
		enum=['SFT', 'DKI', 'NOA', 'MNL']),
	Col(E_ER, 'lat'),
	Col(E_ER, 'lon'),
	Col(E_ER, 'coords_source', 'pos src',
		dtype='enum',
		enum=['FLR', 'LSC', 'DKI', 'MNL']),
	Col(E_ER, 'cme_time', 'CME time', dtype='time'),
	Col(E_ER, 'cme_speed', 'CME speed'),
	Col(E_ER, 'cme_source', 'CME src',
		dtype='enum',
		enum=['LSC', 'DKI', 'CCT']),
	Col(E_ER, 'note', dtype='text'),

	Col(E_ER, 'solarsoft_flr_start', 'SFT FLR start', dtype='time'),
	Col(E_ER, 'noaa_flr_start', 'NOA FLR start', dtype='time'),
	Col(E_ER, 'donki_flr_id', 'DKI FLR', dtype='integer'),
	Col(E_ER, 'donki_cme_id', 'DKI CME', dtype='integer'),
	Col(E_ER, 'lasco_cme_time', 'LASCO CME', dtype='time'),
	Col(E_ER, 'cactus_cme_time', 'CACTs CME', dtype='time'),
	Col(E_ER, 'rc_icme_time', 'R&C ICME', dtype='time'),
]

E_SOURCE_CH = E_CH = 'sources_ch'
SOURCE_CH = [
	Col(E_CH, 'id', dtype='integer', sql_def='SERIAL PRIMARY KEY'),
	Col(E_CH, 'tag', dtype='text', description='STAR Coronal hole tag+'),
	Col(E_CH, 'chimera_time', dtype='time', parse_name='chim time', description='Time of associated solarmonitor CHIMERA run'),
	Col(E_CH, 'chimera_id', dtype='integer', parse_name='chim id', description='CHIMERA number'),

	Col(E_CH, 'time', dtype='time', description='Earth facing position time'),
	Col(E_CH, 'lat', description='Centroid helio-latitude, °'),
	Col(E_CH, 'area', description='Area in % of solar disc'),
	Col(E_CH, 'b', 'B', description='B, G'),
	Col(E_CH, 'phi', 'Φ', description='Φ, Mx * 1e20'),
	Col(E_CH, 'width', description='Longitudinal width, °'),
]

SOURCES_LINKS = {
	donki.FLR_TABLE: ['donki_flr_id', 'id'],
	donki.CME_TABLE: ['donki_cme_id', 'id'],
	lasco_cme.TABLE: ['lasco_cme_time', 'time'],
	cactus_cme.TABLE: ['cactus_cme_time', 'time'],
	r_c_icme.TABLE: ['rc_icme_time', 'time'],
	solarsoft.TABLE: ['solarsoft_flr_start', 'start_time'],
	noaa_flares.TABLE: ['noaa_flr_start', 'start_time'],
	solen_info.TABLE: ['tag', 'tag'],
}

ALL_TABLES: dict[str, list[Col]] = {
	donki.FLR_TABLE: donki.FLR_COLS,
	donki.CME_TABLE: donki.CME_COLS,
	lasco_cme.TABLE: lasco_cme.COLS,
	cactus_cme.TABLE: cactus_cme.COLS,
	r_c_icme.TABLE: r_c_icme.COLS,
	solardemon.DIM_TABLE: solardemon.DIM_COLS,
	solardemon.FLR_TABLE: solardemon.FLR_COLS,
	solarsoft.TABLE: solarsoft.COLS,
	solen_info.TABLE: solen_info.COLS,
	E_FEID: FEID,
	E_FEID_SOURCE: FEID_SOURCE,
	E_SOURCE_CH: SOURCE_CH,
	E_SOURCE_ERUPT: SOURCE_ERUPT
}

EDITABLE_TABLE_NAMES = [solen_info.TABLE, E_FEID, E_FEID_SOURCE, E_SOURCE_CH, E_SOURCE_ERUPT]
EDITABLE_TABLES = {
	table: { c.sql_name: c for c in ALL_TABLES[table] } for table in EDITABLE_TABLE_NAMES
}

def get_col_by_name(entity: str, name: str) -> Col:
	try:
		return next((c for c in ALL_TABLES[entity] if c.name == name))
	except:
		raise NameError(f'Column not found in {entity}: \'{name}\'')