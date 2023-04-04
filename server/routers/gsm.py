from flask import Blueprint, request

from data_series.gsm.database import select, normalize_variation
from routers.utils import route_shielded
import numpy as np

bp = Blueprint('gsm', __name__, url_prefix='/api/gsm')

@bp.route('/', methods=['GET'])
@route_shielded
def get_result():
	t_from = int(request.args.get('from'))
	t_to = int(request.args.get('to'))
	what = request.args.get('what', 'a10m,ax,ay,az,axy').split(',')
	mask_gle = request.args.get('mask_gle', 'true').lower() != 'false'
	res, fields = select([t_from, t_to], what, mask_gle)
	var_fields = [i for i, f in enumerate(fields) if f in ['a10', 'a10m']]
	for i, f in enumerate(fields):
		if f in ['a10', 'a10m']:
			res[:,i] = normalize_variation(res[:,i])
	return { "data": np.where(np.isnan(res), None, res).tolist(), "fields": fields }