from flask import Blueprint, request

from data.omni import core as database
from data.particles_and_xrays import fetch_particles, fetch_xrays
from routers.utils import route_shielded, require_role

bp = Blueprint('omni', __name__, url_prefix='/api/omni')

@bp.route('', methods=['GET'])
@route_shielded
def get_result():
	t_from = int(request.args.get('from', 0))
	t_to = int(request.args.get('to', 86400))
	query = request.args.get('query')
	res, fields = database.select([t_from, t_to], query.split(',') if query else None)
	return { 'fields': fields, 'rows': res.tolist() }

@bp.route('/particles', methods=['GET'])
@route_shielded
def get_part():
	t_from = int(request.args.get('from', 0))
	t_to = int(request.args.get('to', 86400))
	query = request.args.get('query')
	res = fetch_particles(t_from, t_to, query)
	return { 'rows': res }

@bp.route('/xrays', methods=['GET'])
@route_shielded
def get_xra():
	t_from = int(request.args.get('from', 0))
	t_to = int(request.args.get('to', 86400))
	res = fetch_xrays(t_from, t_to)
	return { 'rows': res }

@bp.route('/ensure', methods=['POST'])
@require_role('operator')
@route_shielded
def ensure_trust():
	t_from = request.json.get('from')
	t_to = request.json.get('to')
	return database.ensure_prepared([t_from, t_to], trust=True)

@bp.route('/ensure', methods=['GET'])
@route_shielded
def ensure():
	if 'from' not in request.args:
		return database.dump_info
	t_from = int(request.args.get('from'))
	t_to = int(request.args.get('to'))
	if t_to < t_from:
		raise ValueError('Negative interval')
	return database.ensure_prepared([t_from, t_to])

@bp.route('/upload', methods=['POST'])
@require_role('operator')
@route_shielded
def upload():
	data = request.json['rows']
	var = request.json['variable']
	database.insert(var, data)
	return { 'message': 'OK' }

@bp.route('/fetch', methods=['POST'])
@require_role('operator')
@route_shielded
def fetch():
	t_from = int(request.json.get('from'))
	t_to = int(request.json.get('to'))
	src = request.json.get('source', 'omniweb').lower()
	group = request.json.get('group', 'all').lower()
	ovw = request.json.get('overwrite', False)

	if group == 'geomag' and src not in ['geomag', 'omniweb']:
		return { 'message': 'Geomag can only be fetched from Geomag' }

	count = database.obtain(src, [t_from, t_to], group, ovw)
	return { 'message': f'Upserted [{count} h] of *{group} from {src}' }

@bp.route('/remove', methods=['POST'])
@require_role('operator')
@route_shielded
def remove():
	t_from = int(request.json.get('from'))
	t_to = int(request.json.get('to'))
	group = request.json.get('group', 'all').lower()

	count = database.remove([t_from, t_to], group)
	return { 'message': f'Removed [{count}] hour{"s" if count == 1 else ""} *{group}' }