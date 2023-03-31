from flask import Blueprint, send_file
from routers.utils import reqruire_role
import os

bp = Blueprint('admin', __name__, url_prefix='/api/admin')

@bp.route('/kill')
@reqruire_role('admin')
def kill():
	os._exit(0)
	return { 'rip': 'aid' }

@bp.route('/log')
@reqruire_role('admin')
def logs():
	return send_file('logs/aid.log')
