from flask import Blueprint, request

bp = Blueprint('admin', __name__, url_prefix='/api/admin')

@bp.route('/stats')
def stats():
	return { 'hello': 'world' }