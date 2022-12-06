from flask import Blueprint

bp = Blueprint('admin', __name__, url_prefix='/api/admin')

@bp.route('/stats')
def stats():
	return { 'hello': 'world' }