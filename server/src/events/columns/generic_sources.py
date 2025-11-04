from database import pool
from events.table_structure import ENTITY_CH, SOURCE_ERUPT, SOURCE_CH, SOURCES_LINKS
import numpy as np

# Read columns.ts for g params reference

G_OP_SRC = ['source_value', 'source_count']

ENTITY_S_ERUPT = SOURCE_ERUPT[0]
ENTITY_S_CH = SOURCE_CH[0]

def generate_src_col_name_and_desc(para):
	name = 'wip src col'
	desc = 'wip src col'
	return name, desc

def validate_src_col_params(para):
	pass

def _select_src_entity(feid_ids: list[int], params):
	t_entity = params.target_entity
	t_column = params.target_column
	t_influence = params.influence
	t_order = params.order_by

	is_count = not t_column
	is_ch = ENTITY_S_CH == t_entity or t_entity in ENTITY_CH
	src_table = ENTITY_S_CH if is_ch else ENTITY_S_ERUPT
	src_id_col = 'ch_id' if is_ch else 'erupt_id'

	is_end_src = t_entity not in [ENTITY_S_CH, ENTITY_S_ERUPT]
	target_prefix = ('tgt.' if is_end_src else 'src.')
	prefixed_col = t_column and (target_prefix + t_column)
	target_val = 'COUNT(*)' if is_count else (
		f'EXTRACT(EPOCH FROM {prefixed_col})::integer'
		if 'time' in t_column else prefixed_col)

	join_end_src = ''
	if is_end_src:
		link_id_col, targ_id_col = SOURCES_LINKS[t_entity]
		join_end_src = f'LEFT JOIN {t_entity} tgt ON src.{link_id_col} = tgt.{targ_id_col}'

	order_by = '' 
	if not is_count:
		if is_ch:
			order = 'src.time'
		elif t_order.startswith('time'):
			order = 'COALESCE(src.cme_time, src.flr_start)'
		elif t_order.startswith('position'):
			order = '|/(src.lat^2 + src.lon^2)'
		elif t_order.startswith('cme_speed'):
			order = 'src.cme_speed'
		else:
			assert not 'reached'
		order_by = f'ORDER BY {order} {"DESC" if t_order.endswith('desc') else "ASC"} LIMIT 1'

	subquery = f'SELECT {target_val} FROM events.feid_sources fsrc '+\
		f'LEFT JOIN events.{src_table} src ON src.id = {src_id_col} {join_end_src} '+\
		f'WHERE fsrc.feid_id = feid.id AND fsrc.cr_influence = ANY(%s) {order_by}'
	query = f'SELECT ({subquery}) FROM unnest(%s) AS feid(id)'


	with pool.connection() as conn:
		res = conn.execute(query, [t_influence, feid_ids]).fetchall()
		return res

def compute_src_generic(feid_ids: list[int], params):
	return np.array(_select_src_entity(feid_ids, params))
