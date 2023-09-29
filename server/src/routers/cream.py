from datetime import datetime
from flask import Blueprint, request
import numpy as np

from cream import gsm, ring_of_stations
from routers.utils import route_shielded

MAX_LEN_H = 30 * 24

bp = Blueprint('cream', __name__, url_prefix='/api/cream')

@bp.route('/ros', methods=['GET'])
@route_shielded
def get_circles():
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


@bp.route('/gsm', methods=['GET'])
@route_shielded
def get_result():
	t_from = int(request.args.get('from'))
	t_to = int(request.args.get('to'))
	what = request.args.get('fields', 'a10m,a10,ax,ay,az,axy').split(',')
	mask_gle = request.args.get('mask_gle', 'true').lower() != 'false'
	subtract_trend = request.args.get('subtract_trend', 'true').lower() != 'false'
	res, fields = gsm.select([t_from, t_to], what, mask_gle)
	for i, f in enumerate(fields):
		if len(res) and f in ['a10', 'a10m']:
			res[:,i] = np.round(gsm.normalize_variation(res[:,i], subtract_trend), 2)
		if len(res) and f == 'az':
			res[:,i] = np.round(gsm.normalize_variation(res[:,i], False, True), 2)
	return { "data": np.where(np.isnan(res), None, res).tolist(), "fields": fields }