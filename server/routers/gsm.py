from flask import Blueprint, request

from data_series.gsm import database
from routers.utils import route_shielded

bp = Blueprint('gsm', __name__, url_prefix='/api/gsm')

@bp.route('/', methods=['GET'])
@route_shielded
def get_result():
	t_from = int(request.args.get('from'))
	t_to = int(request.args.get('to'))
	res, fields = database.select([t_from, t_to])
	return { "data": res.tolist(), "fields": fields }