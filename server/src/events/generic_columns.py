from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, asdict
from datetime import datetime
import numpy as np

from database import log, pool
from routers.utils import get_role
from events.generic_core import SERIES, G_EXTREMUM, G_OP_CLONE, G_OP_COMBINE, G_OP_TIME, G_OP_VALUE

def short_entity_name(name):
	return ''.join([a[0].upper() for a in name.split('_')])
def shift_indicator(shift):
	return f"{'+' if shift > 0 else '-'}{abs(int(shift))}" if shift != 0 else ''

@dataclass
class GenericRefPoint:
	type: str # event | extremum
	hours_offset: int
	operation: str = None
	series: str = None
	entity_offset: int = None
	entity: str = None
	end: bool = None

@dataclass
class GenericParams:
	operation: str
	series: str = None
	reference: GenericRefPoint = None
	boundary: GenericRefPoint = None
	column: str = None
	other_column: str = None
	entity_offset: int = None

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
	entity: str
	owner: int
	is_public: bool
	params: GenericParams
	nickname: str = None
	description: str = None

	@classmethod
	def from_row(cls, row):
		gen = cls(*row)
		gen.params = GenericParams.from_dict(gen.params)
		return gen

	@property
	def name(self):
		return f'g__{self.id}'
	@property
	def pretty_name(self):
		if self.nickname is not None:
			return self.nickname
		return self.name # TODO: tododo
	@property
	def desc(self):
		if self.description is not None:
			return self.description
		return 'TBD' # TODO: tododo
	@property
	def data_type(self):
		return 'real' # FIXME: if clone


	@classmethod
	def legacy_info_from_name(cls, name, entity):
		try:
			if not name.startswith('g__'):
				found = table_columns[entity][name]
				return found.get('name', name), found.get('type', 'real')
			found = ALL_GENERICS[int(name[3:])]
		except:
			log.warning('Could not find generic target column: %s', name)
			return '<DELETED>', 'real'
		return found.pretty_name, found.data_type
	def legacy(self):
		pass
		self.name = f'g__{self.id}'

		series, poi = self.series and self.type not in DERIVED_TYPES and SERIES[self.series][2], ''
		if 'abs' in self.type:
			series = f'abs({series})'
		if self.poi in ENTITY_POI:
			poi = ENTITY_SHORT[self.poi.replace('end_', '')].upper() + (' end' if 'end_' in self.poi else '')
		elif self.poi and self.type not in DERIVED_TYPES:
			typ, ser = parse_extremum_poi(self.poi)
			ser = SERIES[ser][2]
			poi = typ.split('_')[-1] + ' ' + (f'abs({ser})' if 'abs' in typ else ser)
		poi_h = poi and poi + shift_indicator(self.shift) + ('h' if self.shift else '')

		ser_desc = series and self.type not in DERIVED_TYPES and f'{SERIES[self.series][0]}({self.series})'
		poi_desc = poi if self.poi != self.entity else "event onset"
		if self.type in ['avg_value', 'value']:
			self.pretty_name = f'{series} [{"ons" if self.poi == self.entity else poi}]'
			if self.shift and self.shift != 0:
				if abs(self.shift) == 1:
					self.description = f'Value of {ser_desc} one hour {"before" if self.shift<0 else "after"} {poi_desc}'
				else:
					what = 'averaged over ' if 'avg' in self.type else ''
					self.description = f'Value of {ser_desc} {what}{abs(self.shift)} hours {"before" if self.shift<0 else "after"} {poi_desc}'
				self.pretty_name += '+' if self.shift > 0 else '-'
				self.pretty_name += f'<{abs(self.shift)}h>' if 'avg' in self.type else f'{abs(self.shift)}h'
			else:
				self.description = f'Value of {ser_desc} at the hour of {poi_desc}'
		elif 'time' in self.type:
			shift = f"{shift_indicator(self.shift)}" if self.shift != 0 else ''
			self.pretty_name = f"offset{'%' if '%' in self.type else ' '}[{poi}{shift}]"
			self.description = f'Time offset between event onset and {poi_desc}, ' + ('%' if '%' in self.type else 'hours')
		elif 'diff' in self.type:
			pretty, gtype1 = GenericColumn.info_from_name(self.series, self.entity)
			pretty2, gtype2 = GenericColumn.info_from_name(self.poi, self.entity)
			if gtype1 not in ['real', 'integer'] or gtype2 not in ['real', 'integer']:
				raise ValueError('Not a number type')
			name = f'{pretty} - {pretty2}'
			self.pretty_name = f'|{name}|' if 'abs' in self.type else f'({name})'
			self.description = f'Column values {"absolute" if "abs" in self.type else " "}difference'
		elif 'clone' == self.type:
			pretty, dtype = GenericColumn.info_from_name(self.series, self.poi)
			self.data_type = dtype
			self.pretty_name = f"[{poi}{shift_indicator(self.shift)}] {pretty}"
			self.description = f'Parameter cloned from associated {self.poi[:-1]} of other event'
		else:
			if 'coverage' == self.type:
				self.pretty_name = f'coverage [{series}]' + (f' to {poi_h}' if poi else '')
				self.description = f'Coverage percentage of {ser_desc}'
			else:
				self.pretty_name = f'{series} {self.type.split("_")[-1]}' + (f' [to {poi_h}]' if poi else '')
				if 'range' == self.type:
					self.description = f'Range of values of {ser_desc}'
				else:
					name = self.type.split('_')[-1]
					name = next((n for n in ['Maximum', 'Minimum', 'Mean', 'Median'] if name in n.lower()))
					self.description = name + (' absolute' if 'abs' in self.type else '') + f' value of {ser_desc}'
			event = ENTITY_SHORT[self.entity].upper()
			if self.entity in ENTITY_WITH_DURATION:
				self.description += ' inside ' + event
			else:
				self.description += f' between {event} start and ' + (poi_h if poi else f'{event} end | next {event} | +{MAX_EVENT_LENGTH_H}h')

def _create_column(conn, g: GenericColumn):
	conn.execute(f'ALTER TABLE events.{g.entity} '+\
		f'ADD COLUMN IF NOT EXISTS {g.name} {g.data_type}')
def _init():
	with pool.connection() as conn:
		conn.execute('''CREATE TABLE IF NOT EXISTS events.generic_columns (
			id serial primary key,
			created timestamp with time zone not null default CURRENT_TIMESTAMP,
			last_computed timestamp with time zone,
			entity text not null,
			owner int references users,
			is_public boolean not null default 'f',
			params json not null,
			nickname text,
			description text)''')
		# generics = select_generics(select_all=True)
		# for generic in generics:
		# 	_create_column(conn, generic)
		# TODO: cleanup 

def select_generics(user_id=None, select_all=False):
	with pool.connection() as conn:
		where = ' WHERE is_public' + ('' if user_id is None else ' OR %s = owner')
		rows = conn.execute('SELECT * FROM events.generic_columns' + ('' if select_all else where),
			[] if user_id is None else [user_id]).fetchall()
	result = [GenericColumn.from_row(row) for row in rows]
	return result

def create_generic(uid, json_params, nickname=None, description=None, entity='forbush_effects'):
	p = GenericParams.from_dict(json_params)
	op = p.operation
	generics = select_generics(uid)

	find_col = lambda c: table_columns[entity].get(c) or \
		next((g for g in generics if g.entity == entity and g.name == c), None)

	if found := next((g for g in generics if g.params == p), None):
		raise ValueError('Such column already exists: '+found.pretty_name)
	if nickname is not None and len(nickname) > 32:
		raise ValueError('Nickname too long')
	if uid and get_role() not in ('operator', 'admin') and len(generics) > 24:
		raise ValueError('Limit reached, please delete some other columns first')
	if entity not in ENTITY or not p.operation:
		raise ValueError('Unknown entity')
	if op in G_OP_CLONE:
		if not find_col(p.column):
			raise ValueError('Column not found')
		if abs(int(p.entity_offset)) > 4:
			raise ValueError('Bad events offset')
	elif op in G_OP_COMBINE:
		if not find_col(p.column):
			raise ValueError('Column A not found')
		if not find_col(p.other_column):
			raise ValueError('Column B not found')
	elif op in G_OP_VALUE:
		if op not in G_OP_TIME and p.series not in SERIES:
			raise ValueError('Unknown series: '+str(p.series))
		if 'abs_' in op and p.series in ['a10', 'a10m']:
			raise ValueError('Absolute variation is nonsense')
		for ref in [p.reference, p.boundary]:
			if ref.type == 'extremum':
				if ref.operation not in G_EXTREMUM:
					raise ValueError('Unknown type of extremum: '+str(ref.operation))
				if ref.series not in SERIES:
					raise ValueError('Unknown series: '+str(ref.series))
			elif ref.type == 'event':
				if abs(int(ref.entity_offset)) > 4:
					raise ValueError('Bad events offset')
				if ref.entity not in EVENT:
					raise ValueError('Not a valid entity: '+str(ref.entity))
				if ref.end is not None and ref.entity not in ENTITY:
					raise ValueError('Entity does not have duration to set end')
			else:
				raise ValueError('Unknown ref point type: '+str(ref.type))
			if abs(int(ref.hours_offset)) > MAX_DURATION_H:
				raise ValueError(f'Max offset is {MAX_DURATION_H} h')
	else:
		raise ValueError('Unknown operation')

	with pool.connection() as conn:
		row = conn.execute('INSERT INTO events.generic_column ' +\
			'(entity, owner, params, nickname, descrption) VALUES (%s,%s,%s,%s,%s) RETURNING *',
			[entity, uid, asdict(p), nickname, description]).fetchone()
		generic = GenericColumn.from_row(row)
		_create_column(conn, generic)
		recompute_generics(generic)
	log.info(f'Generic created by user ({uid}): #{generic.id} {generic.pretty_name} ({generic.entity})')
	return generic

def remove_generic(uid, gid):
	with pool.connection() as conn:
		row = conn.execute('DELETE FROM events.generic_columns WHERE id = %s RETURNING *', [uid, gid]).fetchone()
		if not row:
			return
		generic = GenericColumn.from_row(row)
		conn.execute(f'ALTER TABLE events.{generic.entity} DROP COLUMN IF EXISTS {generic.name}')
	log.info(f'Generic removed by user ({uid}): #{generic.id} {generic.pretty_name} ({generic.entity})')

def recompute_generics(generics, columns=None):
	if not isinstance(generics, list):
		generics = [generics]
	with ThreadPoolExecutor(max_workers=4) as executor:
		res = executor.map(compute_generic, generics, columns) \
			if columns else executor.map(compute_generic, generics)
	return any(res)

_init()
