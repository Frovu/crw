import json
from time import time
from datetime import datetime, timezone

import numpy as np
from flask import Blueprint, request, session
from events.plots import epoch_collision
from events.table import import_fds
from events.generic_columns import upset_generic, remove_generic
from events.other_columns import compute_all, compute_column
from events.source import donki, lasco_cme, r_c_icme, solardemon, solarsoft, solen_info, chimera
import events.text_transforms as tts
from events import samples
from events import query
from routers.utils import route_shielded, require_role, msg
from data import sun_images

from database import get_coverage
from utility import OperationCache
from server import compress

op_cache = OperationCache()
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

@bp.route('/coverage', methods=['GET'])
@route_shielded
def _coverage():
	res = {}
	for c in ['donki_flares', 'donki_cmes', 'solarsoft_flares', 
		'solardemon_flares', 'solardemon_dimmings', 'lasco_cmes', 'r_c_icmes', 'solen_holes']:
		res[c] = get_coverage(c)
	return res

def _fetch_source(progr, source, tstamp):
	month = datetime.utcfromtimestamp(tstamp).replace(day=1, hour=0, minute=0, second=0, tzinfo=timezone.utc)
	if source in ['donki_flares', 'donki_cmes']:
		donki.fetch(progr, source.split('_')[-1], month)
	elif source in ['solarsoft_flares']:
		solarsoft.fetch(progr, source.split('_')[-1], month)
	elif source in ['solardemon_flares', 'solardemon_dimmings']:
		solardemon.fetch(source.split('_')[-1], month)
	elif source == 'lasco_cmes':
		lasco_cme.fetch(progr, month)
	elif source == 'r_c_icmes':
		r_c_icme.fetch()
	elif source == 'solen_holes':
		solen_info.fetch()
	else:
		assert not 'reached'

@bp.route('/fetch_source', methods=['POST'])
@route_shielded
@require_role('operator')
def _get_fetch_source():
	entity = request.json.get('entity')
	timestamp = request.json.get('timestamp')
	return op_cache.fetch(_fetch_source, (entity, timestamp))

@bp.route('/', methods=['GET'])
@route_shielded
@compress.compressed()
def list_events():
	entity = request.args.get('entity')
	if entity:
		return query.select_events(entity)
	changelog = request.args.get('changelog', 'false').lower() == 'true'
	uid = session.get('uid')
	res = query.select_feid(uid, changelog=changelog)
	result = { 'fields': res[1], 'data': res[0] }
	if changelog and uid is not None:
		result['changelog'] = res[2]
	return result

@bp.route('/info/', methods=['GET'])
@route_shielded
def events_tables_info():
	return query.render_table_info(session.get('uid'))

@bp.route('/cme_heighttime', methods=['GET'])
@route_shielded
def _cme_ht():
	t_from = int(request.args.get('from'))
	t_to = int(request.args.get('to'))
	if t_to - t_from > 86400 * 16:
		raise ValueError('Interval too large')
	return lasco_cme.plot_height_time(t_from, t_to)


@bp.route('/chimera', methods=['GET'])
@route_shielded
def _list_chimera():
	t_from = int(request.args.get('from'))
	t_to = int(request.args.get('to'))
	if t_to - t_from > 86400 * 7:
		raise ValueError('Interval too large')
	return chimera.fetch_list(t_from, t_to)

@bp.route('/sun_images', methods=['GET'])
@route_shielded
def _list_sdo():
	t_from = int(request.args.get('from'))
	t_to = int(request.args.get('to'))
	source = request.args.get('source', 'AIA 193')
	if t_to - t_from > 86400 * 3:
		raise ValueError('Interval too large')
	lst = sun_images.fetch_list(t_from, t_to, source)
	return { 'timestamps': lst }

@bp.route('/enlil', methods=['GET'])
@route_shielded
def _resolve_enlil():
	eid = int(request.args.get('id'))
	fname = donki.resolve_enlil(eid)
	return { 'filename': fname }

@bp.route('/linkSource', methods=['POST'])
@route_shielded
@require_role('operator')
def _create_src():
	feid_id = request.json.get('feid_id')
	entity = request.json.get('entity')
	existsing_id = request.json.get('id')
	return query.link_source(feid_id, entity, existsing_id)

@bp.route('/delete', methods=['POST'])
@route_shielded
@require_role('operator')
def _delete_evt():
	eid = request.json.get('id')
	entity = request.json.get('entity')
	query.delete(session.get('uid'), eid, entity)
	return msg('OK')

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
@require_role('user')
def add_sample():
	uid = session.get('uid')
	name = request.json.get('name')
	filters_json = json.dumps(request.json.get('filters'))
	if not name:
		raise ValueError('Empty name')
	return samples.create_sample(uid, name, filters_json, request.json.get('includes'))

@bp.route('/samples/remove', methods=['POST'])
@route_shielded
@require_role('user')
def remove_sample():
	uid = session.get('uid')
	sid = int(request.json.get('id'))
	samples.remove_sample(uid, sid)
	return msg('OK')

@bp.route('/samples/update', methods=['POST'])
@route_shielded
@require_role('user')
def update_sample():
	uid = session.get('uid')
	sid = int(request.json.get('id'))
	name = request.json.get('name')
	authors = request.json.get('authors')
	public = request.json.get('public')
	filters_json = json.dumps(request.json.get('filters'))
	whitelist = request.json.get('whitelist')
	blacklist = request.json.get('blacklist')
	includes = request.json.get('includes')
	if not name:
		raise ValueError('Empty name')
	samples.update_sample(uid, sid, name, authors, public, filters_json, whitelist, blacklist, includes)
	return msg('OK')

@bp.route('/text_transforms', methods=['GET'])
@route_shielded
def get_tts():
	uid = session.get('uid')
	return { 'list': tts.select(uid) }

@bp.route('/text_transforms/upsert', methods=['POST'])
@route_shielded
@require_role('user')
def upsert_tts():
	uid = session.get('uid')
	name = request.json.get('name')
	public = request.json.get('public')
	transforms = json.dumps(request.json.get('transforms'))
	tts.upsert(uid, name, public, transforms)
	return msg('OK')

@bp.route('/text_transforms/remove', methods=['POST'])
@route_shielded
@require_role('user')
def remove_tts():
	uid = session.get('uid')
	name = request.json.get('name')
	tts.remove(uid, name)
	return msg('OK')

@bp.route('/generics', methods=['POST'])
@route_shielded
@require_role('user')
def _create_generic():
	uid = session.get('uid')
	start = time()
	generic = upset_generic(uid, request.json)
	return { 'generic': generic.as_dict(uid), 'name': generic.name, 'time': round(time() - start, 3) }

@bp.route('/generics/remove', methods=['POST'])
@route_shielded
@require_role('user')
def _remove_generic():
	uid = session.get('uid')
	gid = int(request.json.get('id'))
	remove_generic(uid, gid)
	return msg('OK')

@bp.route('/compute', methods=['POST'])
@route_shielded
@require_role('user')
def _compute_generic():
	name = request.json.get('id')
	start = time()
	err = compute_column(name)
	if err:
		return msg(err), 500
	return { 'time': round(time() - start, 2) }

@bp.route('/compute_row', methods=['POST'])
@route_shielded
@require_role('user')
def _compute_row_generic():
	rid = int(request.json.get('id'))
	return compute_all(rid)

@bp.route('/compute_all', methods=['POST'])
@route_shielded
@require_role('operator')
def _compute_everything():
	return compute_all()

@bp.route('/importTable', methods=['POST'])
@route_shielded
@require_role('operator')
def _import_table():
	uid = session.get('uid')
	body = request.json
	import_fds(uid, body['columns'], body['add'], body['remove'], body['changes'])
	return msg('OK')
