from flask import Blueprint, request
from datetime import datetime

from data_series.neutron import ring_of_stations
from routers.utils import route_shielded

bp = Blueprint('neutron', __name__, url_prefix='/api/neutron')

@bp.route('/ros/', methods=['GET'])
@route_shielded
def get_circles():
	MAX_LEN_H = 30 * 24
	t_from = int(request.args.get('from'))
	t_to = int(request.args.get('to'))
	exclude = request.args.get('exclude')
	details = int(request.args.get('details', 0))
	auto_filter = request.args.get('autoFilter', 'true') == 'true'
	base = int(request.args.get('base', 0))
	window = int(request.args.get('window', -1))
	exclude = exclude.upper().split(',') if exclude else []
	trim_future = datetime.now().timestamp()
	t_to = t_to if t_to < trim_future else trim_future
	trim_len = t_to - MAX_LEN_H * 3600
	t_from = t_from if t_from > trim_len else trim_len
	if t_to - t_from < 86400 * 2:
		raise ValueError()

	body = ring_of_stations.get(t_from, t_to, exclude, details, window, base, auto_filter)
	return body