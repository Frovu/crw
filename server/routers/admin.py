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
@bp.route('/logs')
@reqruire_role('admin')
def logs():
	with open('logs/aid.log') as file:
		text = file.read()
	return '<html><head></head><body style="color: #ccc; background-color: #000"><pre>' + text + '</pre></body></html>'
