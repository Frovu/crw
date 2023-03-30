from flask import Blueprint, request, session
from time import time
from core import database
from core.generic_columns import recompute_generics, select_generics, add_generic, remove_generic, init_generics
from routers.utils import route_shielded, reqruire_role

bp = Blueprint('events', __name__, url_prefix='/api/events')

@bp.route('/recompute_generics', methods=['POST'])
@route_shielded
@reqruire_role('admin')
def _recompute_generics():
	start = time()
	init_generics()
	return f'Done ({int(time() - start)} s)'

@bp.route('/generics/add', methods=['POST'])
@route_shielded
@reqruire_role('operator')
def _add_generic():
	uid = session.get('uid')
	start = time()
	generic = add_generic(uid, *[request.json.get(a) for a in ['entity', 'series', 'type', 'poi', 'shift']])
	return { 'id': generic.name, 'name': generic.pretty_name, 'time': time() - start }

@bp.route('/generics/remove', methods=['POST'])
@route_shielded
@reqruire_role('operator')
def _remove_generic():
	uid = session.get('uid')
	gid = int(request.json.get('id'))
	remove_generic(uid, gid)
	return 'OK'

@bp.route('/generics/compute', methods=['POST'])
@route_shielded
@reqruire_role('operator')
def _compute_generic():
	uid = session.get('uid')
	gid = int(request.json.get('id'))
	generic = next((g for g in select_generics(uid) if g.id == gid), None)
	if not generic:
		return 'Generic not found', 404
	start = time()
	recompute_generics(generic)
	return f'Computed in {round(time() - start, 1)} s'

@bp.route('/', methods=['GET'])
@route_shielded
def list_events():
	t_from = request.args.get('from')
	t_to = request.args.get('to')
	uid = session.get('uid')
	res = database.select_events(t_from, t_to, uid)
	return { "data": res[0], "fields": res[1]}

@bp.route('/info/', methods=['GET'])
@route_shielded
def events_tables_info():
	return database.render_table_info(session.get('uid'))