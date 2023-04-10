from flask import Blueprint, send_file
from routers.utils import require_role
from core.database import pool, ENTITY_SHORT
import os

bp = Blueprint('admin', __name__, url_prefix='/api/admin')

@bp.route('/kill')
@require_role('admin')
def kill():
	os._exit(0)
	return { 'rip': 'aid' }

@bp.route('/log')
@bp.route('/logs')
@require_role('admin')
def logs():
	with open('logs/aid.log') as file:
		text = file.read()
	return '<html><head></head><body style="color: #ccc; background-color: #000"><pre>' + text + '</pre></body></html>'

@bp.route('/changes')
@bp.route('/changelog')
@require_role('admin')
def changes():
	with pool.connection() as conn:
		rows = conn.execute('''SELECT time, (select login from users where uid = author), event_id, entity_name, column_name, old_value, new_value
			FROM events.changes_log ORDER BY time''').fetchall()
		text = ''
		for time, author, eid, ent, col, old, new in rows:
			text += f'[{time}] @{author} {ENTITY_SHORT[ent]} #{eid} .{col}: {old} -> <b>{new}</b>\r\n'
	return '<html><head></head><body style="color: #ccc; background-color: #000; line-height: 1.1em"><pre>' + text + '</pre></body></html>'
