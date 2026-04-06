from flask import Blueprint, request

import data.omni.query as omni
from data import particles_and_xrays
from routers.utils import route_shielded, require_role, msg

bp = Blueprint('omni', __name__, url_prefix='/api/omni')

@bp.route('', methods=['GET'])
@route_shielded
def get_result():
	t_from = int(request.args.get('from', 0))
	t_to = int(request.args.get('to', 86400))
	query = request.args.get('query', 'sw_speed,imf_scalar')
	res, fields = omni.select((t_from, t_to), query.split(','))
	return { 'fields': fields, 'rows': res.tolist() }

@bp.route('/particles', methods=['GET'])
@route_shielded
def get_part():
	t_from = int(request.args.get('from', 0))
	t_to = int(request.args.get('to', 86400))
	query = request.args.get('query', '').split(',')
	res, fields = particles_and_xrays.fetch('particles', t_from, t_to, query)
	return { 'fields': fields, 'rows': res }

@bp.route('/xrays', methods=['GET'])
@route_shielded
def get_xra():
	t_from = int(request.args.get('from', 0))
	t_to = int(request.args.get('to', 86400))
	res, fields = particles_and_xrays.fetch('xrays', t_from, t_to)
	return { 'fields': fields, 'rows': res }

@bp.route('/ensure', methods=['POST'])
@require_role('operator')
@route_shielded
def ensure_trust():
	t_from = request.json.get('from')
	t_to = request.json.get('to')
	return omni.ensure_prepared((t_from, t_to), trust=True)

@bp.route('/ensure', methods=['GET'])
@route_shielded
def ensure():
	t_from = int(request.args.get('from', ''))
	t_to = int(request.args.get('to', ''))
	if t_to < t_from:
		raise ValueError('Negative interval')
	return omni.ensure_prepared((t_from, t_to))

@bp.route('/upload', methods=['POST'])
@require_role('operator')
@route_shielded
def upload():
	data = request.json['rows']
	var = request.json['variable']
	omni.insert(var, data)
	return msg('OK')

@bp.route('/fetch', methods=['POST'])
@require_role('operator')
@route_shielded
def fetch():
	t_from = int(request.json.get('from'))
	t_to = int(request.json.get('to'))
	source = omni.SOURCE(str(request.json.get('source')).lower())
	group_names = str(request.json.get('groups')).lower().split(',')
	groups = [omni.GROUP(g) for g in group_names]
	overwrite = request.json.get('overwrite', False)

	count = omni.obtain((t_from, t_to), groups, source, overwrite=overwrite)
	return msg(f'Upserted [{count} h] from {str(source.value).upper()}')

@bp.route('/remove', methods=['POST'])
@require_role('operator')
@route_shielded
def remove():
	t_from = int(request.json.get('from'))
	t_to = int(request.json.get('to'))
	group_names = str(request.json.get('groups')).lower().split(',')
	groups = [omni.GROUP(g) for g in group_names]

	count = omni.remove((t_from, t_to), groups)
	return msg(f'Removed [{count}] hour{"s" if count == 1 else ""} of ' + ','.join([str(g.value).upper() for g in groups]))