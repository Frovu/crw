from flask import Blueprint, request
from data.neutron import core as neutron, corrections
from routers.utils import route_shielded, require_role

bp = Blueprint('neutron', __name__, url_prefix='/api/neutron')

@bp.route('', methods=['GET'])
@route_shielded
def get_neutron():
	t_from = int(request.args.get('from', 'none'))
	t_to = int(request.args.get('to', 'none'))
	sts_req = request.args.get('stations', 'all').lower()
	stations = neutron.get_stations() if sts_req == 'all' \
		else [s for s in [neutron.resolve_station(s) for s in sts_req.split(',')] if s is not None]
	if len(stations) < 1:
		raise ValueError('No stations match query')
	if t_from >= t_to:
		raise ValueError('Bad interval')
	rows, fields = neutron.fetch((t_from, t_to), stations)
	return { 'fields': fields, 'rows': rows }

@bp.route('/rich', methods=['GET'])
@route_shielded
def get_rich_neutron():
	t_from = int(request.args.get('from', 'none'))
	t_to = int(request.args.get('to', 'none'))
	sts_req = request.args.get('stations', 'all').lower()
	stations = neutron.get_stations() if sts_req == 'all' \
		else [s for s in [neutron.resolve_station(s) for s in sts_req.split(',')] if s is not None]
	if len(stations) < 1:
		raise ValueError('No stations match query')
	if t_from >= t_to:
		raise ValueError('Bad interval')
	return corrections.fetch_rich((t_from, t_to), stations)

@bp.route('/minutes', methods=['GET'])
@route_shielded
def get_minutes():
	timestamp = int(request.args.get('timestamp', 'none'))
	sname = request.args.get('station') # FIXME !!
	station = neutron.resolve_station(sname)
	if station is None:
		raise ValueError('Unknown station')
	return corrections.get_minutes(station, timestamp)

@bp.route('/refetch', methods=['GET'])
@route_shielded
@require_role('operator')
def refetch():
	t_from = int(request.args.get('from', 'none'))
	t_to = int(request.args.get('to', 'none'))
	sts_req = request.args.get('stations').lower()
	stations = [s for s in [neutron.resolve_station(s) for s in sts_req.split(',')] if s is not None]
	if len(stations) < 1:
		raise ValueError('No stations match query')
	return corrections.refetch([t_from, t_to], stations)

@bp.route('/revision', methods=['POST'])
@route_shielded
@require_role('operator')
def revision():
	corrs = request.json.get('revisions' )
	author = request.json.get('author', None) # FIXME
	comment = request.json.get('comment', None) # FIXME
	resolved = {}
	for s in corrs:
		if (sta := neutron.resolve_station(s)) is None:
			raise ValueError('Unknown station: '+s)
		resolved[sta.id] = corrs[s]
	corrections.revision(author, comment, resolved)
	return { 'message': 'OK' }

@bp.route('/revert', methods=['POST'])
@route_shielded
@require_role('operator')
def revert_revision():
	rid = request.json.get('id')
	corrections.revert_revision(rid)
	return { 'message': 'OK' }