import json
from dataclasses import dataclass, asdict
from datetime import datetime

from database import log, pool
from events.columns_old.generic_sources import G_OP_SRC, init_src_col, validate_src_col_params
from routers.utils import get_role
from data.omni.sw_types import PRETTY_SW_TYPES
from events.table_structure import FEID
from events.columns_old.generic_core import GenericRefPoint, G_TIME_SRC_WITH_END, G_TIME_SRC, G_SERIES, \
	G_EXTREMUM, G_OP_CLONE, G_OP_COMBINE, G_OP_TIME, G_OP_VALUE, \
	MAX_DURATION_H, compute_generic, default_window

def shift_indicator(shift):
	return f"{'+' if shift > 0 else '-'}{abs(int(shift))}" if shift != 0 else ''

def find_column_info(rows, name):
	try:
		if not name.startswith('g__'):
			found = FEID[1][name]
			return found.pretty_name or name, found.data_type, 'FE'

		gen = next((GenericColumn.from_row(row, rows) for row in rows if str(row[0]) == name.replace('g__', '')))
		return gen.pretty_name, gen.data_type, gen.rel
	except:
		log.warning('Could not find generic target column: %s', name)
		return '<DELETED>', 'real', 'FE'

@dataclass
class GenericParams:
	operation: str
	series: str = None
	reference: GenericRefPoint = None
	boundary: GenericRefPoint = None
	column: str = None
	other_column: str = None
	events_offset: int = None
	influence: list[str] = None
	target_entity: str = None
	target_column: str = None
	order_by: str = None

	def as_dict(self):
		data = asdict(self)
		for i in asdict(self):
			if data[i] is None:
				del data[i]
		for ref in ['reference', 'boundary']:
			if data.get(ref):
				for i in asdict(self)[ref]:
					if data[ref][i] is None:
						del data[ref][i]

		return data
	@classmethod
	def from_dict(cls, data):
		gen = cls(**data)
		if gen.operation in G_OP_VALUE:
			gen.reference = GenericRefPoint(**data['reference'])
			gen.boundary = GenericRefPoint(**data['boundary'])
		return gen

@dataclass
class GenericColumn:
	id: int
	created: datetime
	last_computed: datetime
	owner: int
	is_public: bool
	params: GenericParams
	nickname: str = None
	description: str = None
	rel: str = None # TODO:
	pretty_name: str = None
	desc: str = None
	data_type: str = None
	sql_data_type: str = None

	@classmethod
	def from_row(cls, row, gs=None):
		self = cls(*row)
		self.params = GenericParams.from_dict(self.params)
		para = self.params
		op = para.operation

		self.data_type = 'real'
		if self.description and self.nickname:
			self.pretty_name = self.nickname
			self.desc = self.description
			if op not in G_OP_CLONE: # should set data_type
				return

		if not gs:
			return self
		if op in G_OP_COMBINE:
			assert 'diff' in op
			pretty1, _, _ = find_column_info(gs, para.column)
			pretty2, _, _ = find_column_info(gs, para.other_column)
			name = f'{pretty1} - {pretty2}'.replace(' ', '')
			pretty_name = f'|{name}|' if 'abs' in op else f'({name})'
			description = f'Column values {"absolute " if "abs" in op else ""}difference: ' + pretty_name
		elif op in G_OP_CLONE:
			pretty, dtype, r_rel = find_column_info(gs, para.column)
			self.data_type = 'text' if dtype == 'enum' else dtype
			pretty_name = f'[{r_rel if r_rel != "FEID" else "FE"}{shift_indicator(para.events_offset)}' if para.events_offset != 0 else '['
			pretty_name += f'] {pretty}'
			description = f'Parameter cloned from {r_rel} associated with {"other" if para.events_offset != 0 else "this"} event'
		elif op in G_OP_VALUE:
			is_default = all([a == b for a, b in zip(default_window(), (para.reference, para.boundary))])
			def point(ref):
				if ref.type == 'event':
					txt = ref.time_src + \
						('_e' if ref.end else '') + shift_indicator(ref.events_offset)
				elif ref.type == 'extremum':
					eop, ser = ref.operation, G_SERIES[ref.series][2]
					txt = f"{eop.replace('abs_','')}({('|'+ser+'|') if 'abs' in eop else ser})"
				elif ref.type == 'sw_structure':
					txt = '#' + ref.structure + ('_e' if ref.end else '')
				else: 
					assert not 'reached'
				return txt + shift_indicator(ref.hours_offset) + ('h' if ref.hours_offset != 0 else '')
			interv = (f" {{{point(para.reference)};{point(para.boundary)}}}" if not is_default else '')
			if op in G_OP_TIME:
				assert 'time_offset' in op
				pretty_name = f"offset{'%' if '%' in op else ''}" + interv			
				description = 'Time offset in ' + \
					('%% of duration' if '%' in op else 'hours')
			else:
				ser = G_SERIES[para.series][2]
				if 'coverage' == op:
					pretty_name = f'covers[{ser}]' + interv
					description = f'Coverage percentage of {ser}'
				else:
					assert op in G_EXTREMUM or op in ['mean', 'median', 'range']
					aop = op.split("_")[-1]
					pretty_name = f'{("|"+ser+"|") if "abs" in op else ser} {aop}' + interv
					if 'range' == op:
						description = f'Difference between max and min values of {ser}'
					else:
						name = next((n for n in ['Maximum', 'Minimum', 'Mean', 'Median'] if aop in n.lower()))
						description = name + (' absolute' if 'abs' in op else '') + f' value of {ser}'
			description += f' between {point(para.reference)} and {point(para.boundary)}'

		elif op in G_OP_SRC:
			pretty_name, description, dtype = init_src_col(para)
			self.data_type = dtype
		else:
			assert not 'reached'

		self.sql_data_type = self.data_type
		if self.data_type == 'enum':
			self.sql_data_type = 'text'
		if self.data_type == 'time':
			self.sql_data_type = 'timestamptz'
		
		self.pretty_name = self.nickname or pretty_name
		self.desc = self.description or description
		return self

	def as_dict(self, uid=None):
		data = asdict(self)
		data['params'] = self.params.as_dict()
		data['is_own'] = data['owner'] == uid
		del data['owner']
		return data

	@property
	def name(self):
		return f'g__{self.id}'

def _create_column(conn, g: GenericColumn):
	conn.execute(f'ALTER TABLE events.generic_data ADD COLUMN IF NOT EXISTS {g.name} {g.sql_data_type}')

def _init():
	with pool.connection() as conn:
		conn.execute('''CREATE TABLE IF NOT EXISTS events.generic_columns (
			id serial primary key,
			created timestamp with time zone not null default CURRENT_TIMESTAMP,
			last_computed timestamp with time zone,
			owner int references users,
			is_public boolean not null default 'f',
			params json not null,
			nickname text,
			description text,
			rel text)''')
		conn.execute('CREATE TABLE IF NOT EXISTS events.generic_data ('+
			'feid_id INTEGER NOT NULL UNIQUE REFERENCES events.feid ON DELETE CASCADE)')
	generics = select_generics(select_all=True)
	with pool.connection() as conn:
		for generic in generics:
			_create_column(conn, generic)

def select_generics(user_id=None, select_all=False):
	with pool.connection() as conn:
		where = ' WHERE is_public' + ('' if user_id is None else ' OR %s = owner')
		rows = conn.execute('SELECT * from events.generic_columns' + ('' if select_all else where),
			[] if user_id is None else [user_id]).fetchall()
	# FIXME: whole initialization process feels weird
	result = [GenericColumn.from_row(row, rows) for row in rows]
	return result
_init()

def upset_generic(uid, json_body, col_id):
	gid, nickname, description, is_public = \
		[json_body.get(i) for i in ('gid', 'nickname', 'description', 'is_public')]
	p = GenericParams.from_dict(json_body['params'])
	op = p.operation
	generics = select_generics(uid)

	def find_col(col):
		if col.startswith('g__'):
			return next((g for g in generics if g.name == col), None)
		return FEID[1].get(col)

	if gid and not (found := next((g for g in generics if g.id == gid), None)):
		raise ValueError('Trying to edit generic that does not exist')
	if gid and found.owner != uid and get_role() != 'admin':
		raise ValueError('Forbidden')
	if not gid and (found := next((g for g in generics if g.params == p), None)):
		raise ValueError('Such column already exists: '+found.pretty_name)
	if nickname is not None and len(nickname) > 24:
		raise ValueError('Nickname too long')
	if not gid and uid and get_role() not in ('operator', 'admin') \
		and len([g for g in generics if g.owner == uid]) > 19:
		raise ValueError('Limit reached, please delete some other columns first')
	if op in G_OP_CLONE:
		if not find_col(p.column):
			raise ValueError('Column not found')
		if abs(int(p.events_offset)) > 4:
			raise ValueError('Bad events offset')
	elif op in G_OP_COMBINE:
		if not (c1 := find_col(p.column)):
			raise ValueError('Column A not found')
		if not (c2 := find_col(p.other_column)):
			raise ValueError('Column B not found')
		if c1.data_type not in ['real', 'integer'] or c2.data_type not in ['real', 'integer']:
			raise ValueError('Only numerical columns are supported')
	elif op in G_OP_VALUE:
		if op not in G_OP_TIME and p.series not in G_SERIES:
			raise ValueError('Unknown series: '+str(p.series))
		if 'abs_' in op and p.series in ['a10', 'a10m']:
			raise ValueError('Absolute variation is nonsense')
		for ref in [p.reference, p.boundary]:
			if ref.type == 'extremum':
				if ref.operation not in G_EXTREMUM:
					raise ValueError('Unknown type of extremum: '+str(ref.operation))
				if ref.series not in G_SERIES:
					raise ValueError('Unknown series: '+str(ref.series))
			elif ref.type == 'sw_structure':
				if ref.structure not in PRETTY_SW_TYPES:
					raise ValueError('Unknown SW structure: '+str(ref.structure))
			elif ref.type == 'event':
				if abs(int(ref.events_offset)) > 4:
					raise ValueError('Bad events offset')
				if ref.time_src not in G_TIME_SRC:
					raise ValueError('Not a valid entity: '+str(ref.time_src))
				if ref.end is not None and ref.time_src not in G_TIME_SRC_WITH_END:
					raise ValueError('Entity does not have duration to set end')
			else:
				raise ValueError('Unknown ref point type: '+str(ref.type))
			if abs(int(ref.hours_offset)) > MAX_DURATION_H:
				raise ValueError(f'Max offset is {MAX_DURATION_H} h')
	elif op in G_OP_SRC:
		validate_src_col_params(p)
	else:
		raise ValueError('Unknown operation')

	with pool.connection() as conn:
		if gid is None:
			row = conn.execute('INSERT INTO events.generic_columns ' +\
				'(owner, is_public, params, nickname, description, rel) VALUES (%s,%s,%s,%s,%s,%s) RETURNING *',
				[uid, is_public, json.dumps(p.as_dict()), nickname, description, 'FE']).fetchone()
			generic = GenericColumn.from_row(row, generics)
			_create_column(conn, generic)
			log.info(f'Generic created by user ({uid}): #{generic.id} {generic.pretty_name}')
		else:
			row = conn.execute('UPDATE events.generic_columns SET ' +\
				'params=%s, is_public=%s, nickname=%s, description=%s WHERE id = %s RETURNING *',
				[json.dumps(p.as_dict()), is_public, nickname, description, gid]).fetchone()
			generic = GenericColumn.from_row(row, generics)
			log.info(f'Generic edited by user ({uid}): #{generic.id} {generic.pretty_name}')
	if not gid or found.params != p:
		compute_generic(generic)
	return generic

def remove_generic(uid, gid):
	with pool.connection() as conn:
		row = conn.execute('SELECT * from events.generic_columns WHERE id = %s', [gid]).fetchone()
		if not row:
			return ValueError('Not found')
		generic = GenericColumn.from_row(row)
		if generic.owner != uid and get_role() != 'admin':
			return ValueError('Forbidden')
		conn.execute('DELETE from events.generic_columns WHERE id = %s', [gid])
		conn.execute(f'ALTER TABLE events.generic_data DROP COLUMN IF EXISTS {generic.name}')
	log.info(f'Generic removed by user ({uid}): #{generic.id} {generic.pretty_name}')
