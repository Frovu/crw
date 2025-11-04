
from events.source import cactus_cme, donki, lasco_cme, noaa_flares, r_c_icme, solardemon, solarsoft, solen_info
from events.columns.column_def import ColumnDef

C_FE  = lambda *args, **kwargs: ColumnDef('feid', *args, **kwargs, rel='FE')
C_MC  = lambda *args, **kwargs: ColumnDef('feid', 'mc_' +args[0], *args[1:], pretty_name=args[0], **kwargs, rel='MC')
C_CME = lambda *args, **kwargs: ColumnDef('feid', 'cme_'+args[0], *args[1:], **kwargs, rel='CME')
C_FLR = lambda *args, **kwargs: ColumnDef('feid', 'flr_'+args[0], *args[1:], **kwargs, rel='FLR')

# FIXME: remove noaa flares
SELECT_FEID = 'events.feid LEFT JOIN events.generic_data ON id = feid_id LEFT JOIN events.legacy_noaa_flares fl ON fl.start_time = flr_time'

FEID = ['feid', { c.name: c for c in [
	C_FE('id', data_type='integer', sql='id SERIAL PRIMARY KEY'),
	C_FE('time',
		sql='time timestamptz NOT NULL UNIQUE',
		not_null=True,
		data_type='time',
		description='Event onset time',
		parse_name='Time'),
	C_FE('duration',
		not_null=True,
		computed=True,
		data_type='integer',
		description='Effective event duration, hours',
		parse_name='Te'),
	C_FE('onset_type',
		pretty_name='ons type',
		data_type='enum',
		enum=['SSC', 'iSW', 'SI'],
		description='Onset time origin: SSC; SI - Sudden impulse, ground data; iSW - satellite data',
		parse_name='OType',
		parse_value={'1': 'SSC', '2': 'iSW', '3': 'SI', '9': None}),
	C_FE('s_type',
		pretty_name='src type',
		data_type='real',
		description='Solar source index (it\'s complicated),',
		parse_name='SType'),
	C_FE('s_description',
		pretty_name='src info',
		data_type='text',
		description='Solar source description',
		parse_name='Source'),
	C_FE('s_confidence',
		pretty_name='src conf',
		data_type='enum',
		enum=['low', 'avg', 'high'],
		description='Overall source determination confidence',
		parse_name='Qs',
		parse_value={'3': 'low', '4': 'avg', '5': 'high'}),
	C_FE('old_magnitude',
		pretty_name='_magnitude',
		description='(AB), FD magnitude as maximum 10 GV CR density variation obtained using GSM corrected for magnetospheric effect using the Dst-index',
		parse_name='MagnM'),
	C_FE('gamma',
		description='(AB), rigidity spectrum exponent during the hour of minimum CR density',
		parse_name='GammaM'),
	C_FE('vmbm',
		computed=True,
		pretty_name='VmBm',
		description='Vmax / 400 * Bmax / 5'),

	C_FE('base_period',
	  	data_type='time',
		pretty_name='base',
		description='24-h base period start'),

	C_FE('pre_increase',
		pretty_name='pre incr',
		description='0 - no pre-increse, 1 - questionable, 2 - confident'),
	C_FE('pre_inc_width',
		pretty_name='p-inc width',
		description='Average longitudinal width of the pre-increase'),
	C_FE('pre_inc_direction',
		pretty_name='p-inc lon',
		description='Longitude of the pre-increase maximum'),
	C_FE('pre_inc_duration',
		pretty_name='p-inc dur',
		description='Pre-increase duration in hours'),
	C_FE('pre_inc_magnitude',
		pretty_name='p-inc magn',
		description='Pre-increase magnitude according to RSM'),
		
	C_FE('pre_decrease',
		pretty_name='pre decr',
		description='0 - no pre-decrese, 1 - questionable, 2 - confident'),
	C_FE('pre_dec_width',
		pretty_name='p-dec width',
		description='Average longitudinal width of the pre-decrease'),
	C_FE('pre_dec_direction',
		pretty_name='p-dec lon',
		description='Longitude of the pre-decrease maximum'),
	C_FE('pre_dec_duration',
		pretty_name='p-dec dur',
		description='Pre-decrease duration in hours'),
	C_FE('pre_dec_magnitude',
		pretty_name='p-dec magn',
		description='Pre-decrease magnitude according to RSM'),


	C_FE('comment', data_type='text', description='Additional information'),

	C_MC('time', data_type='time', parse_name='MCStartTime'),
	C_MC('duration', parse_name='MCDur'),
	C_MC('originator', data_type='integer', parse_name='MC'),
	C_MC('size', parse_name='RMC'),

	C_CME('time',
		pretty_name='CME time',
		data_type='time',
		parse_name='CMETime'),
	C_CME('legacy_v0',
		pretty_name='Vmean0',
		parse_name='VMean0'),
	C_CME('v_index',
		pretty_name='V idx',
		description='CME V0 / 1000',
		computed=True),

	C_FLR('time',
		pretty_name='flare time',
		data_type='time',
		parse_name='STime',
		description='Flare start time'),
	C_FLR('x_index',
		pretty_name='X idx',
		description='Xm * dt1 / 1000',
		computed=True)
]}]

C_SRC = lambda *args, **kwargs: ColumnDef('feid_sources',  *args, **kwargs)
C_CH  = lambda *args, **kwargs: ColumnDef('sources_ch',    *args, **kwargs)
C_ER  = lambda *args, **kwargs: ColumnDef('sources_erupt', *args, **kwargs)

FEID_SOURCE = ['feid_sources', { c.name: c for c in [
	C_SRC('id', data_type='integer', sql='id SERIAL PRIMARY KEY'),
	C_SRC('feid_id',  data_type='integer', sql='feid_id integer NOT NULL REFERENCES events.feid ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED'),
	C_SRC('ch_id',    data_type='integer', sql='ch_id integer REFERENCES events.sources_ch ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED'),
	C_SRC('erupt_id', data_type='integer', sql='erupt_id integer REFERENCES events.sources_erupt ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED'),

	C_SRC('cr_influence', data_type='enum', enum=['primary', 'secondary', 'residual']),
]}]

ENTITY_ERUPT = ['solarsoft_flares', 'donki_flares', 'legacy_noaa_flares', 'lasco_cmes', 'cactus_cmes', 'donki_cmes', 'r_c_icmes']
ENTITY_CH = ['solen_holes']

SOURCE_ERUPT = ['sources_erupt', { c.name: c for c in [
	C_ER('id', data_type='integer', sql='id SERIAL PRIMARY KEY'),
	C_ER('flr_start', pretty_name='XF start', data_type='time'),
	C_ER('flr_peak', pretty_name='XF peak', data_type='time'),
	C_ER('flr_end', pretty_name='XF end', data_type='time'),
	C_ER('flr_flux', pretty_name='XF flux'),
	C_ER('active_region', pretty_name='AR', data_type='integer'),
	C_ER('flr_source',
		pretty_name='XF src',
		data_type='enum',
		enum=['SFT', 'DKI', 'NOA', 'MNL']),
	C_ER('lat'),
	C_ER('lon'),
	C_ER('coords_source',
		pretty_name='pos src',
		data_type='enum',
		enum=['FLR', 'LSC', 'DKI', 'MNL']),
	C_ER('cme_time', pretty_name='CME time', data_type='time'),
	C_ER('cme_speed', pretty_name='CME speed'),
	C_ER('cme_source',
		pretty_name='CME src',
		data_type='enum',
		enum=['LSC', 'DKI', 'CCT']),
	C_ER('note', data_type='text'),

	C_ER('solarsoft_flr_start', data_type='time', pretty_name='SFT FLR start'),
	C_ER('noaa_flr_start', data_type='time', pretty_name='NOA FLR start'),
	C_ER('donki_flr_id', data_type='integer', pretty_name='DKI FLR'),
	# C_ER('solardemon_flr_id', data_type='integer', pretty_name='dMN FLR'),
	C_ER('donki_cme_id', data_type='integer', pretty_name='DKI CME'),
	C_ER('lasco_cme_time', data_type='time', pretty_name='LASCO CME'),
	C_ER('cactus_cme_time', data_type='time', pretty_name='CACTs CME'),
	C_ER('rc_icme_time', data_type='time', pretty_name='R&C ICME'),
]}]

SOURCE_CH = ['sources_ch', { c.name: c for c in [
	C_CH('id', data_type='integer', sql='id SERIAL PRIMARY KEY'),
	C_CH('tag', data_type='text', description='STAR Coronal hole tag+'),
	C_CH('chimera_time', data_type='time', parse_name='chim time',
		description='Time of associated solarmonitor CHIMERA run'),
	C_CH('chimera_id', data_type='integer', parse_name='chim id',
		description='CHIMERA number'),

	C_CH('time', data_type='time', description='Earth facing position time'),
	C_CH('lat', description='Centroid helio-latitude, °'),
	C_CH('area', description='Area in % of solar disc'),
	C_CH('b', pretty_name='B', description='B, G'),
	C_CH('phi', pretty_name='Φ', description='Φ, Mx * 1e20'),
	C_CH('width', description='Longitudinal width, °'),
]}]

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

ALL_TABLES = {
	donki.FLR_TABLE: donki.FLR_COLS,
	donki.CME_TABLE: donki.CME_COLS,
	lasco_cme.TABLE: lasco_cme.COLS,
	cactus_cme.TABLE: cactus_cme.COLS,
	r_c_icme.TABLE: r_c_icme.COLS,
	solardemon.DIM_TABLE: solardemon.DIM_COLS,
	solardemon.FLR_TABLE: solardemon.FLR_COLS,
	solarsoft.TABLE: solarsoft.COLS,
	solen_info.TABLE: solen_info.COLS,
	FEID[0]: list(FEID[1].values()),
	FEID_SOURCE[0]: list(FEID_SOURCE[1].values()),
	SOURCE_CH[0]: list(SOURCE_CH[1].values()),
	SOURCE_ERUPT[0]: list(SOURCE_ERUPT[1].values())
}

EDITABLE_TABLES = {
	solen_info.TABLE: { c.name: c for c in solen_info.COLS },
	FEID[0]: FEID[1],
	SOURCE_CH[0]: SOURCE_CH[1],
	SOURCE_ERUPT[0]: SOURCE_ERUPT[1],
	FEID_SOURCE[0]: FEID_SOURCE[1],
}