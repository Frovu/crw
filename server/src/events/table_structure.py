
from dataclasses import dataclass

@dataclass
class ColumnDef:
	entity: str
	name: str   # sql column name
	computed: bool=False
	not_null: bool=False
	generic: dict=None       # generic column description
	pretty_name: str=None     # name visible by user
	data_type: str='real' # time|integer|real|text|enum
	enum: list=None
	description: str=None
	parse_name: str=None
	parse_value: str=None
	parse_stub: str=None
	sql: str=None
	rel: str=None

	def enum_name(self):
		return f'enum_{self.entity}_{self.name}'

	def __post_init__(self):
		if self.sql:
			return
		
		dtype = self.data_type
		if dtype == 'time':
			dtype = 'timestamptz'
		if dtype == 'enum':
			dtype = 'text'
		if self.not_null:
			dtype += ' NOT NULL'
		if self.enum:
			dtype += f' REFERENCES events.{self.enum_name()} ON UPDATE CASCADE'
		self.sql = self.name + ' ' + dtype

		if self.generic:
			self.computed = True

	def as_dict(self):
		col = {
			'id': self.name,
			'parseName': self.parse_name,
			'parseValue': self.parse_value,
			'nullable': not self.not_null,
			'name': self.pretty_name or self.name,
			'type': self.data_type,
			'isComputed': self.computed,
			'rel': self.rel
		}
		if self.enum:
			col['enum'] = self.enum
		if self.description:
			col['description'] = self.description
		return col

C_FE  = lambda *args, **kwargs: ColumnDef('feid', *args, **kwargs, rel='FEID')
C_MC  = lambda *args, **kwargs: ColumnDef('feid', 'mc_' +args[0], *args[1:], **kwargs, rel='MC')
C_CME = lambda *args, **kwargs: ColumnDef('feid', 'cme_'+args[0], *args[1:], **kwargs, rel='CME')
C_FLR = lambda *args, **kwargs: ColumnDef('feid', 'flr_'+args[0], *args[1:], **kwargs, rel='FLR')

FEID = ['feid', { c.name: c for c in [
	C_FE('id', data_type='integer', sql='id SERIAL PRIMARY KEY'),
	C_FE('time',
		sql='timestamptz NOT NULL UNIQUE',
		not_null=True,
		data_type='time',
		description='Event onset time',
		parse_name='Time'),
	C_FE('duration',
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
	C_FE('comment', data_type='text', description='Additional information'),

	C_MC('time', data_type='time', parse_name='MCStartTime'),
	C_MC('duration', parse_name='MCDur'),
	C_MC('originator', data_type='integer', parse_name='MC'),
	C_MC('size', parse_name='RMC'),

	C_CME('time', data_type='time', parse_name='CMETime'),
	C_CME('v_index',
		pretty_name='V idx',
		description='CME V0 / 1000',
		computed=True),

	C_FLR('time',
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

FEID_SOURCE = ['feid_sorces', { c.name: c for c in [
	C_SRC('id', data_type='integer', sql='id SERIAL PRIMARY KEY'),
	C_SRC('feid_id',  data_type='integer', sql='feid_id integer NOT NULL REFERENCES events.feid ON DELETE CASCADE'),
	C_SRC('ch_id',    data_type='integer', sql='ch_id integer REFERENCES events.sources_ch ON DELETE CASCADE'),
	C_SRC('erupt_id', data_type='integer', sql='erupt_id integer REFERENCES events.sources_erupt ON DELETE CASCADE'),

	C_SRC('cr_influence', data_type='enum', enum=['residual', 'primary', 'secondary']),
]}]

SOURCE_ERUPT = ['sources_ch', { c.name: c for c in [
	C_ER('id', data_type='integer', sql='id SERIAL PRIMARY KEY'),
	C_ER('lasco_cme_time', data_type='time'),
	C_ER('ab_flr_time', data_type='time'),
	C_ER('rc_icme_time', data_type='time'),
]}]

SOURCE_CH = ['sources_erupt', { c.name: c for c in [
	C_CH('id', data_type='integer', sql='id SERIAL PRIMARY KEY'),
	C_CH('tag', data_type='text'),
]}]
