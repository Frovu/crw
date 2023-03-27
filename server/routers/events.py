from flask import Blueprint, request, session
from time import time
from core import database
from core.generic_columns import compute_generics, select_generics
from routers.utils import route_shielded, reqruire_role

bp = Blueprint('events', __name__, url_prefix='/api/events')

@bp.route('/recompute_generics', methods=['POST'])
@route_shielded
@reqruire_role(['admin'])
def recompute_generics():
	start = time()
	compute_generics(select_generics())
	return f'Done ({int(time() - start)} s)'

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
	return database.render_table_info(session.get('uid'))