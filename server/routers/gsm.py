from flask import Blueprint, request

from data_series.gsm.database import select, normalize_variation
from routers.utils import route_shielded

bp = Blueprint('gsm', __name__, url_prefix='/api/gsm')

@bp.route('/', methods=['GET'])
@route_shielded
def get_result():
	t_from = int(request.args.get('from'))
	t_to = int(request.args.get('to'))
	res, fields = select([t_from, t_to])
	res[:,1] = normalize_variation(res[:,1])
	res[:,2] = normalize_variation(res[:,2])
	return { "data": res.tolist(), "fields": fields }