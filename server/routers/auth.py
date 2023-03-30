from flask import Blueprint, request, session
from server import bcrypt
from routers.utils import route_shielded, reqruire_role, get_role
from core.database import pg_conn
import logging, os

log = logging.getLogger('aides')
bp = Blueprint('auth', __name__, url_prefix='/api/auth')

ROLES = ['admin', 'operator']

def init():
	with pg_conn.cursor() as cursor:
		cursor.execute('''CREATE TABLE IF NOT EXISTS users (
			uid SERIAL PRIMARY KEY,
			created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			last_login TIMESTAMP,
			login TEXT UNIQUE,
			password TEXT NOT NULL,
			role TEXT)''')
		cursor.execute('SELECT * FROM users WHERE role = \'admin\'')
		if len(cursor.fetchall()) < 1:
			log.info('AUTH: Creating admin account')
			password = os.environ.get('ADMIN_PASSWORD')
			if not password:
				log.error('AUTH: please export ADMIN_PASSWORD')
				os._exit(1)
			cursor.execute('SELECT login FROM users WHERE login = %s', ['admin'])
			exists = cursor.fetchone()
			if not exists:
				pwd = bcrypt.generate_password_hash(password, rounds=10).decode()
				cursor.execute('INSERT INTO users(login, password, role) VALUES (%s, %s, %s)', ['admin', pwd, 'admin'])
	pg_conn.commit()
init()

@bp.route('/upsert', methods=['POST'])
@reqruire_role('admin')
def upsert():
	login = request.json.get('login')
	role = request.json.get('role')
	passw = request.json.get('password')
	if not login or (passw and len(passw) < 6) or (role and role not in ROLES):
		return {}, 400
	with pg_conn.cursor() as cursor:
		cursor.execute('SELECT login FROM users WHERE login = %s', [login])
		exists = cursor.fetchone()
		print(exists)
		if not exists and not passw:
			return 'Not exists'
		fields, values = [], []
		if passw:
			pwd = bcrypt.generate_password_hash(passw, rounds=10).decode()
			fields.append('password')
			values.append(pwd)
		if role:
			fields.append('role')
			values.append(role)
		cursor.execute(f'''INSERT INTO users(login, {",".join(fields)}) VALUES (%s, {",".join(["%s" for f in fields])})
			ON CONFLICT(login) DO UPDATE SET ''' + ','.join([f'{f} = EXCLUDED.{f}' for f in fields]),
			[login] + values)
	log.info(f'AUTH: user upserted: {login}' + ('role -> ' + role if role else ''))
	pg_conn.commit()
	return 'Modified' if exists else 'Created'

@bp.route('/login', methods=['POST'])
def login():
	login = request.json.get('login')
	passw = request.json.get('password')
	if not login or not passw:
		return {}, 400
	with pg_conn.cursor() as cursor:
		cursor.execute('SELECT uid, login, password FROM users WHERE login = %s', [login])
		res = cursor.fetchone()
		if not res: return {}, 404
		uid, uname, pwd = res
		if not bcrypt.check_password_hash(pwd.encode(), passw):
			return {}, 401
		cursor.execute('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE login = %s', [login])
	pg_conn.commit()
	session['uid'] = uid
	session['uname'] = uname
	log.info(f'AUTH: user authorized: {login}')
	return { 'login': uname }

@bp.route('/password', methods=['POST'])
def password():
	new_pass = request.json.get('newPassword')
	req_pass = request.json.get('password')
	uid = session.get('uid')
	if not uid: return {}, 401
	if not new_pass or len(new_pass) < 6: return {}, 400
	with pg_conn.cursor() as cursor:
		cursor.execute('SELECT uid, login, password FROM users WHERE uid = %s', [uid])
		res = cursor.fetchone()
		if not res: return {}, 404
		uid, uname, pwd = res
		if not bcrypt.check_password_hash(pwd.encode(), req_pass):
			return {}, 401
		new_pwd = bcrypt.generate_password_hash(new_pass, rounds=10).decode()
		cursor.execute('UPDATE users SET password = %s WHERE uid = %s', [new_pwd, uid])
	pg_conn.commit()
	log.info(f'AUTH: user changed password: {uname}')
	return { 'login': uname }

@bp.route('/login', methods=['GET'])
@route_shielded
def get_user():
	return { 'login': session.get('uname'), 'role': get_role() }

@bp.route('/logout', methods=['POST'])
def logout():
	uname = session.get('uname')
	if uname:
		session['uid'] = None
		session['uname'] = None
		log.info(f'AUTH: user logged out: {uname}')
	return { 'logout': uname }