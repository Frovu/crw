from flask import Blueprint, request, session
from time import time
import json
from core import database
from core.generic_columns import recompute_generics, select_generics, add_generic, remove_generic, init_generics
import core.samples as samples
from routers.utils import route_shielded, require_role

bp = Blueprint('events', __name__, url_prefix='/api/events')

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

@bp.route('/recompute_generics', methods=['POST'])
@route_shielded
@require_role('admin')
def _recompute_generics():
	start = time()
	init_generics()
	return f'Done ({round(time() - start, 1)} s)'

@bp.route('/generics/add', methods=['POST'])
@route_shielded
@require_role('operator')
def _add_generic():
	uid = session.get('uid')
	start = time()
	generic = add_generic(uid, *[request.json.get(a) for a in ['entity', 'series', 'type', 'poi', 'shift']])
	return { 'id': generic.name, 'name': generic.pretty_name, 'time': time() - start }

@bp.route('/generics/remove', methods=['POST'])
@route_shielded
@require_role('operator')
def _remove_generic():
	uid = session.get('uid')
	gid = int(request.json.get('id'))
	remove_generic(uid, gid)
	return 'OK'

@bp.route('/generics/compute', methods=['POST'])
@route_shielded
@require_role('operator')
def _compute_generic():
	uid = session.get('uid')
	gid = int(request.json.get('id'))
	generic = next((g for g in select_generics(uid) if g.id == gid), None)
	if not generic:
		return 'Generic not found', 404
	start = time()
	recompute_generics(generic)
	return f'Computed in {round(time() - start, 1)} s'

@bp.route('/samples', methods=['GET'])
@route_shielded
def get_samples():
	uid = session.get('uid')
	return { 'samples': samples.select(uid) }

@bp.route('/samples/create', methods=['POST'])
@route_shielded
@require_role('operator')
def add_sample():
	uid = session.get('uid')
	name = request.json.get('name')
	if not name: raise ValueError('Empty name')
	return samples.create_sample(uid, name)

@bp.route('/samples/remove', methods=['POST'])
@route_shielded
@require_role('operator')
def remove_sample():
	uid = session.get('uid')
	sid = int(request.json.get('id'))
	samples.remove_sample(uid, sid)
	return 'OK'

@bp.route('/samples/update', methods=['POST'])
@route_shielded
@require_role('operator')
def update_sample():
	uid = session.get('uid')
	sid = int(request.json.get('id'))
	name = request.json.get('name')
	authors = request.json.get('authors')
	filters_json = json.dumps(request.json.get('filters'))
	whitelist = request.json.get('whitelist')
	blacklist = request.json.get('blacklist')
	if not name: raise ValueError('Empty name')
	samples.update_sample(uid, sid, name, authors, filters_json, whitelist, blacklist)
	return 'OK'

@bp.route('/samples/publish', methods=['POST'])
@route_shielded
@require_role('operator')
def publish_sample():
	uid = session.get('uid')
	sid = int(request.json.get('id'))
	public = request.json.get('public')
	if type(public) != bool:
		raise ValueError('Not boolean')
	samples.publish_sample(uid, sid, public)
	return 'OK'