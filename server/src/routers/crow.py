
from flask import Blueprint, request
from routers.utils import route_shielded

from crow.rsm import query as rsm

bp = Blueprint('crow', __name__, url_prefix='/api/crow')

@bp.route('/rsm/circles', methods=['GET'])
@route_shielded
def get_circles_plot():
	t_from = int(request.args.get('from', ''))
	t_to = int(request.args.get('to', ''))

	return rsm.fetch_circles(t_from, t_to)

@bp.route('/rsm/all', methods=['GET'])
@route_shielded
def get_rsm_all():
	t_from = int(request.args.get('from', ''))
	t_to = int(request.args.get('to', ''))
	window = int(request.args.get('window', ''))

	return rsm.fetch_circles(t_from, t_to, True, window=window)