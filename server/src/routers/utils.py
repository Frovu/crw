import traceback
from flask import session
from database import pool, log

ROLES = ['admin', 'operator', 'user']

def msg(string):
	return { 'message': string }

def get_role():
	uid = session.get('uid')
	if uid is None:
		return None
	with pool.connection() as conn:
		res = conn.execute('SELECT role FROM users WHERE uid = %s', [uid]).fetchone()
		return res and res[0]

def route_shielded(func):
	def wrapper(*args, **kwargs):
		try:
			return func(*args, **kwargs)
		except ValueError as exc:
			if str(exc):
				log.error(f'Error in {func.__name__}: {traceback.format_exc()}')
			return msg(str(exc)), 400
		except BaseException as exc:
			log.error(f'Error in {func.__name__}: {traceback.format_exc()}')
			return msg(f'Error in {func.__name__}, {str(exc)}'), 500
	wrapper.__name__ = func.__name__
	return wrapper

def require_role(r_role: str):
	def decorator(func):
		def wrapper(*args, **kwargs):
			if (role := get_role()) is None:
				return { 'message': 'Unauthorized' }, 401
			if role not in ROLES or ROLES.index(role) > ROLES.index(r_role):
				return { 'message': 'Forbidden' }, 403
			return func(*args, **kwargs)
		wrapper.__name__ = func.__name__
		return wrapper
	return decorator
