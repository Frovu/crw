import os
from flask import Blueprint
from routers.utils import require_role
from core.database import pool, ENTITY_SHORT

bp = Blueprint('admin', __name__, url_prefix='/api/admin')

@bp.route('/kill')
@require_role('admin')
def kill():
	os._exit(0)

@bp.route('/log')
@bp.route('/logs')
@require_role('admin')
def get_logs():
	with open('logs/aid.log', encoding='utf-8') as file:
		text = file.read()
	return f'''<html><head></head>
	<body style="color: #ccc; background-color: #000; font-size: 14px">
	<pre>{text}</pre>
	<script>window.scrollTo(0, document.body.scrollHeight);</script>
	</body></html>'''

@bp.route('/users')
@require_role('admin')
def get_users():
	with pool.connection() as conn:
		rows = conn.execute('SELECT uid, login, role, last_login FROM users').fetchall()
		text = ''
		for uid, login, role, last_login in rows:
			text += f'last login [{str(last_login)[:19]}] #{uid} @<b>{login}</b> :{role} \r\n'
	return '<html><head></head><body style="color: #ccc; background-color: #000; line-height: 1.5em; font-size: 16px"><pre>' + text + '</pre></body></html>'

@bp.route('/generics')
@require_role('admin')
def get_generics():
	with pool.connection() as conn:
		rows = conn.execute('SELECT * FROM events.generic_columns_info ORDER BY last_computed').fetchall()
		text = ''
		for gid, created, last_comp, ent, users, gtype, series, poi, shift in rows:
			text += f'[{str(created)[:19]} / {str(last_comp)[:19]}] #{gid} @{users} {ENTITY_SHORT[ent]} {gtype} {series} {poi} {shift}\r\n'
	return '<html><head></head><body style="color: #ccc; background-color: #000; font-size: 14px"><pre>' + text + '</pre></body></html>'

@bp.route('/changes')
@bp.route('/changelog')
@require_role('admin')
def get_changes():
	with pool.connection() as conn:
		rows = conn.execute('''SELECT time, (select login from users where uid = author), event_id, entity_name, column_name, old_value, new_value
			FROM events.changes_log ORDER BY time''').fetchall()
		text = ''
		for time, author, eid, ent, col, old, new in rows:
			text += f'[{str(time)[:19]}] @{author} {ENTITY_SHORT[ent]} #{eid} .{col}: {old} -> <b>{new}</b>\r\n'
	return '<html><head></head><body style="color: #ccc; background-color: #000; font-size: 14px"><pre>' + text + '</pre></body></html>'
