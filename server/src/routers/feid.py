import json
from time import time
import numpy as np
from flask import Blueprint, request, session
from events.plots import epoch_collision
from events.table import import_fds
from events.generic_columns import select_generics, upset_generic, remove_generic
from events.generic_core import recompute_generics, recompute_for_row
from events import other_columns
from events import samples
from events import query
from server import compress
from routers.utils import route_shielded, require_role, msg

bp = Blueprint('events', __name__, url_prefix='/api/events')

@bp.route('/epoch_collision', methods=['POST'])
@route_shielded
def _epoch_collision():
	interval = request.json.get('interval')
	times = request.json.get('times')
	series = request.json.get('series')
	if not times or not interval or not series:
		raise ValueError('malformed request')
	if interval[1] - interval[0] <= 0 or int(interval[1]) - int(interval[0]) > 600:
		raise ValueError('interval too large')

	res = epoch_collision(times, interval, series)
	offset, median, mean, std = [np.where(np.isnan(v), None, np.round(v, 3)).tolist() for v in res]
	return { 'offset': offset, 'median': median, 'mean': mean, 'std': std }

@bp.route('/', methods=['GET'])
@route_shielded
@compress.compressed()
def list_events():
	changelog = request.args.get('changelog', 'false').lower() == 'true'
	uid = session.get('uid')
	res = query.select_events(uid, changelog=changelog)
	result = { 'fields': res[1], 'data': res[0] }
	if changelog and uid is not None:
		result['changelog'] = res[2]
	return result

@bp.route('/info/', methods=['GET'])
@route_shielded
def events_tables_info():
	return query.render_table_info(session.get('uid'))

@bp.route('/changes', methods=['POST'])
@route_shielded
@require_role('operator')
def _submit_changes():
	changes = request.json.get('changes')
	uid = session.get('uid')
	if not changes or len(changes) < 1:
		raise ValueError('Empty request')
	query.submit_changes(uid, changes)
	return msg('OK')

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
	filters_json = json.dumps(request.json.get('filters'))
	if not name:
		raise ValueError('Empty name')
	return samples.create_sample(uid, name, filters_json)

@bp.route('/samples/remove', methods=['POST'])
@route_shielded
@require_role('operator')
def remove_sample():
	uid = session.get('uid')
	sid = int(request.json.get('id'))
	samples.remove_sample(uid, sid)
	return msg('OK')

@bp.route('/samples/update', methods=['POST'])
@route_shielded
@require_role('operator')
def update_sample():
	uid = session.get('uid')
	sid = int(request.json.get('id'))
	name = request.json.get('name')
	authors = request.json.get('authors')
	public = request.json.get('public')
	filters_json = json.dumps(request.json.get('filters'))
	whitelist = request.json.get('whitelist')
	blacklist = request.json.get('blacklist')
	if not name:
		raise ValueError('Empty name')
	samples.update_sample(uid, sid, name, authors, public, filters_json, whitelist, blacklist)
	return msg('OK')

@bp.route('/generics', methods=['POST'])
@route_shielded
@require_role('operator')
def _create_generic():
	uid = session.get('uid')
	start = time()
	generic = upset_generic(uid, request.json)
	return { 'generic': generic.as_dict(uid), 'name': generic.name, 'time': round(time() - start, 3) }

@bp.route('/generics/remove', methods=['POST'])
@route_shielded
@require_role('operator')
def _remove_generic():
	uid = session.get('uid')
	gid = int(request.json.get('id'))
	remove_generic(uid, gid)
	return msg('OK')

@bp.route('/generics/compute', methods=['POST'])
@route_shielded
@require_role('operator')
def _compute_generic():
	uid = session.get('uid')
	gid = int(request.json.get('id'))
	start = time()
	generic = next((g for g in select_generics(uid) if g.id == gid), None)
	if not generic:
		return msg('Generic not found' ), 404
	if not recompute_generics(generic):
		return msg('Failed miserably'), 500
	return { 'time': round(time() - start, 2) }

@bp.route('/generics/compute_row', methods=['POST'])
@route_shielded
@require_role('operator')
def _compute_row_generic():
	rid = int(request.json.get('id'))
	start = time()
	generics = select_generics(select_all=True)
	if not recompute_for_row(generics, rid):
		return msg('Failed miserably'), 500
	return { 'time': round(time() - start, 2) }

@bp.route('/recompute_other', methods=['POST'])
@route_shielded
@require_role('admin')
def _recompute_other():
	start = time()
	other_columns.compute_all()
	return msg(f'Done ({round(time() - start, 1)} s)')

@bp.route('/importTable', methods=['POST'])
@route_shielded
@require_role('admin')
def _import_table():
	uid = session.get('uid')
	body = request.json
	import_fds(uid, body['columns'], body['add'], body['remove'], body['changes'])
	return msg('OK')
