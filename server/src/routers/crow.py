
from flask import Blueprint, request
from routers.utils import route_shielded

from crow.rsm import historical

bp = Blueprint('crow', __name__, url_prefix='/api/crow')

@bp.route('/rsm/historical', methods=['GET'])
@route_shielded
def get_rsm_plot():
	t_from = int(request.args.get('from', ''))
	t_to = int(request.args.get('to', ''))
	event_starts = [int(a) for a in request.args.get('events', '').split(',')]

	return historical.fetch_variations(t_from, t_to, event_starts)
