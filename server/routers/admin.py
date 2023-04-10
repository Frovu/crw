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
	return '<html><head></head><body style="color: #ccc; background-color: #000; font-size: 14px"><pre>' + text + '</pre></body></html>'

@bp.route('/users')
@require_role('admin')
def users():
	with pool.connection() as conn:
		rows = conn.execute('SELECT uid, login, role, last_login FROM users').fetchall()
		text = ''
		for uid, login, role, last_login in rows:
			text += f'last seen [{str(last_login)[:19]}] #{uid} @<b>{login}</b> :{role} \r\n'
	return '<html><head></head><body style="color: #ccc; background-color: #000; line-height: 1.5em; font-size: 16px"><pre>' + text + '</pre></body></html>'

@bp.route('/generics')
@require_role('admin')
def generics():
	with pool.connection() as conn:
		rows = conn.execute('SELECT * FROM events.generic_columns_info ORDER BY last_computed').fetchall()
		text = ''
		for gid, created, last_comp, ent, users, gtype, series, poi, shift in rows:
			text += f'[{str(created)[:19]} / {str(last_comp)[:19]}] #{gid} @{users} {ENTITY_SHORT[ent]} {gtype} {series} {poi} {shift}\r\n'
	return '<html><head></head><body style="color: #ccc; background-color: #000; font-size: 14px"><pre>' + text + '</pre></body></html>'

@bp.route('/changes')
@bp.route('/changelog')
@require_role('admin')
def changes():
	with pool.connection() as conn:
		rows = conn.execute('''SELECT time, (select login from users where uid = author), event_id, entity_name, column_name, old_value, new_value
			FROM events.changes_log ORDER BY time''').fetchall()
		text = ''
		for time, author, eid, ent, col, old, new in rows:
			text += f'[{str(time)[:19]}] @{author} {ENTITY_SHORT[ent]} #{eid} .{col}: {old} -> <b>{new}</b>\r\n'
	return '<html><head></head><body style="color: #ccc; background-color: #000; font-size: 14px"><pre>' + text + '</pre></body></html>'
