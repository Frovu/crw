from flask import Blueprint, request, send_file
from datetime import datetime
from core import database
from routers.utils import route_shielded

bp = Blueprint('events', __name__, url_prefix='/api/events')

@bp.route('/', methods=['GET'])
@route_shielded
def list_events():
	t_from = request.args.get('from')
	t_to = request.args.get('to')
	res = database.select_all(t_from, t_to)
	return { "data": res[0], "fields": res[1]}

@bp.route('/info/', methods=['GET'])
@route_shielded
def events_tables_info():
	return send_file('data/tables_rendered.json')