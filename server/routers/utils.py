from flask import session
from core.database import pool
import logging, traceback
log = logging.getLogger('aides')

def msg(string):
	return { 'message': string }

def get_role():
	uid = session.get('uid')
	if uid is None: return None
	with pool.connection() as conn:
		res = conn.execute('SELECT role FROM users WHERE uid = %s', [uid]).fetchone()
		return res and res[0]

def route_shielded(func):
	def wrapper(*args, **kwargs):
		try:
			return func(*args, **kwargs)
		except ValueError as e:
			if str(e): log.error(f'Error in {func.__name__}: {traceback.format_exc()}')
			return { 'message': str(e) }, 400
		except Exception:
			log.error(f'Error in {func.__name__}: {traceback.format_exc()}')
			return { 'message': f'Error in {func.__name__}, {str(e)}' }, 500
	wrapper.__name__ = func.__name__
	return wrapper

def require_role(r_role: str):
	def decorator(func):
		def wrapper():
			if (role := get_role()) is None: 
				return { 'message': 'Unauthorized' }, 401
			if role != r_role and role != 'admin':
				return { 'message': 'Forbidden' }, 403 
			return func()
		wrapper.__name__ = func.__name__
		return wrapper
	return decorator
