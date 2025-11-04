from database import pool
from events.table_structure import ALL_TABLES, ENTITY_CH, SOURCE_ERUPT, SOURCE_CH, SOURCES_LINKS
import numpy as np

# Read columns.ts for g params reference

G_OP_SRC = ['source_value', 'source_count']

ENTITY_S_ERUPT = SOURCE_ERUPT[0]
ENTITY_S_CH = SOURCE_CH[0]

def init_src_col(para):
	short_infl = ",".join([i[0] for i in para.influence])
	ent_short = para.target_entity.replace('sources', '')
	if para.operation == 'source_count':
		name = f'count[{ent_short}|{short_infl}]'
		desc = f'Count of {ent_short} events associated with FEID with {" or ".join(para.influence)} influence'
		dtype = 'integer'
	else:
		tgt_col = next(col for col in ALL_TABLES[para.target_entity] if col.name == para.target_column)
		name = f'{para.target_column} [{ent_short}|{short_infl}|{para.order_by}]'
		desc = f'{para.target_column} value of {ent_short} event associated with FEID with {" or ".join(para.influence)} influence selected as ordered by {para.order_by}\n\n{tgt_col.description}'
		dtype = tgt_col.data_type
	return name, desc, dtype

def validate_src_col_params(para):
	pass # TODO:

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

	join_end_src = ''
	if is_end_src:
		link_id_col, targ_id_col = SOURCES_LINKS[t_entity]
		join_end_src = f'LEFT JOIN events.{t_entity} tgt ON src.{link_id_col} = tgt.{targ_id_col}'
	else:
		targ_id_col = 'id'

	target_val = f'COUNT({target_prefix}{targ_id_col})' if is_count else prefixed_col

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

def compute_src_generic(feid_ids: np.ndarray, params):
	return np.array(_select_src_entity(feid_ids.tolist(), params))
