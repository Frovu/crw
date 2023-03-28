from flask import session
from core.database import pg_conn
import logging, traceback
log = logging.getLogger('aides')

def get_role():
	uid = session.get('uid')
	if uid is None: return None
	with pg_conn.cursor() as cursor:
		cursor.execute('SELECT role FROM users WHERE uid = %s', [uid])
		res = cursor.fetchone()
		return res and res[0]

def route_shielded(func):
	def wrapper(*args, **kwargs):
		try:
			return func(*args, **kwargs)
		except ValueError as e:
			if str(e): log.error(f'Error in {func.__name__}: {traceback.format_exc()}')
			return {}, 400
		except Exception:
			log.error(f'Error in {func.__name__}: {traceback.format_exc()}')
			return {}, 500
	wrapper.__name__ = func.__name__
	return wrapper

def reqruire_role(r_role: str):
	def decorator(func):
		def wrapper():
			if (role := get_role()) is None: 
				return {}, 401
			if role != r_role and role != 'admin':
				return {}, 403 
			return func()
		wrapper.__name__ = func.__name__
		return wrapper
	return decorator
