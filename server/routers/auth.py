from flask import Blueprint, request, session
from server import bcrypt
from routers.utils import route_shielded
from core.database import pg_conn
import logging, os

log = logging.getLogger('aides')
bp = Blueprint('auth', __name__, url_prefix='/api/auth')

def create_user(login, password, role):
	with pg_conn.cursor() as cursor:
		cursor.execute('SELECT login FROM users WHERE login = %s', [login])
		exists = cursor.fetchall()
		if exists:
			return False
		pwd = bcrypt.generate_password_hash(password, rounds=10).decode()
		cursor.execute('INSERT INTO users(login, password, role) VALUES (%s, %s, %s)', [login, pwd, role])
		pg_conn.commit()
		return True

def get_role(uid):
	with pg_conn.cursor() as cursor:
		cursor.execute('SELECT role FROM users WHERE uid = %s', [uid])
		res = cursor.fetchone()
		return res and res[0]

def init():
	with pg_conn.cursor() as cursor:
		cursor.execute('''CREATE TABLE IF NOT EXISTS users (
			uid SERIAL PRIMARY KEY, created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			last_login TIMESTAMP, login TEXT, password TEXT, role TEXT)''')
		cursor.execute('SELECT * FROM users WHERE role = \'admin\'')
		if len(cursor.fetchall()) < 1:
			log.info('AUTH: Creating admin account')
			password = os.environ.get('ADMIN_PASSWORD')
			if not password:
				log.error('AUTH: please export ADMIN_PASSWORD')
				os._exit(1)
			create_user('admin', password, 'admin')
	pg_conn.commit()
init()

@bp.route('/login', methods=['POST'])
def login():
	login = request.values.get('login')
	passw = request.values.get('password')
	if not login or not passw:
		return {}, 400
	with pg_conn.cursor() as cursor:
		cursor.execute('SELECT uid, login, password FROM users WHERE login = %s', [login])
		res = cursor.fetchall()
	if not res: return {}, 404
	uid, uname, pwd = res[0]
	if not bcrypt.check_password_hash(pwd.encode(), passw):
		return {}, 401
	with pg_conn.cursor() as cursor:
		cursor.execute('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE login = %s', [login])
		pg_conn.commit()
	session['uid'] = uid
	session['uname'] = uname
	logging.info(f'AUTH: user authorized: {login}')
	return { 'login': uname }

@bp.route('/login', methods=['GET'])
@route_shielded
def get_user():
	return { 'login': session.get('uname'), 'role': get_role(session.get('uid')) }

@bp.route('/logout', methods=['POST'])
def logout():
    uname = session.get('uname')
    if uname:
        session['uid'] = None
        session['uname'] = None
        logging.info(f'AUTH: user logged out: {uname}')
    return { 'logout': uname }