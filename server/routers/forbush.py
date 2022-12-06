from flask import Blueprint, request
from datetime import datetime
from core import database
from routers.utils import route_shielded

bp = Blueprint('forbush', __name__, url_prefix='/api/forbush')

@bp.route('/')
@route_shielded
def list_events():
	t_from = request.args.get('from')
	t_to = request.args.get('to')
	res = database.select_all(t_from, t_to)
	return { "data": res[0], "fields": res[1]}