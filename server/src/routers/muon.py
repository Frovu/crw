from flask import Blueprint, request

from data.muon.core import select_experiments, obtain_all, do_revision
from data.muon.corrections import select_with_corrected, get_local_coefficients, set_coefficients
from routers.utils import route_shielded, require_role, msg

bp = Blueprint('muon', __name__, url_prefix='/api/muon')

@bp.route('experiments', methods=['GET'])
@route_shielded
def do_select_experiments():
	return { 'experiments': select_experiments() }

@bp.route('', methods=['GET'])
@route_shielded
def do_select_result():
	t_from = int(request.args.get('from'))
	t_to = int(request.args.get('to'))
	experiment = request.args.get('experiment')
	channel = request.args.get('cahnnel', 'V')
	query = request.args.get('query', 'corrected').split(',')
	rows, fields = select_with_corrected(t_from, t_to, experiment, channel, query)
	return { 'fields': fields, 'rows': rows }

@bp.route('compute', methods=['GET'])
@route_shielded
@require_role('operator')
def do_comp_corr():
	t_from = int(request.args.get('from'))
	t_to = int(request.args.get('to'))
	experiment = request.args.get('experiment')
	channel = request.args.get('channel', 'V')
	fit = request.args.get('fit')
	res = get_local_coefficients(t_from, t_to, experiment, channel, fit)
	info, time, data = res or (None, [], [])
	return { 'info': info, 'time': time, 'expected': data }

@bp.route('obtain', methods=['POST'])
@route_shielded
@require_role('operator')
def do_obtain_all():
	t_from = int(request.json.get('from'))
	t_to = int(request.json.get('to'))
	experiment = request.json.get('experiment')
	partial = request.json.get('partial')
	return obtain_all(t_from, t_to, experiment, partial)

@bp.route('revision', methods=['POST'])
@route_shielded
@require_role('operator')
def do_insert_revision():
	t_from = int(request.json.get('from'))
	t_to = int(request.json.get('to'))
	experiment = request.json.get('experiment')
	channel = request.json.get('channel')
	action = request.json.get('action')
	do_revision(t_from, t_to, experiment, channel, action)
	return msg('OK')

@bp.route('coefs', methods=['POST'])
@route_shielded
@require_role('operator')
def do_set_coefs():
	set_coefficients(request.json)
	return msg('OK')