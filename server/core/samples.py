from core.database import pool

def _init():
	with pool.connection() as conn:
		conn.execute('''CREATE TABLE IF NOT EXISTS events.samples (
			id SERIAL PRIMARY KEY,
			created TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			last_modified TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			name TEXT NOT NULL,
			authors int[],
			is_public BOOLEAN NOT NULL DEFAULT 'f',
			filters JSON,
			whitelist int[] NOT NULL DEFAULT '{}',
			blacklist int[] NOT NULL DEFAULT '{}',
			UNIQUE (name, authors))''')
_init()

def create_sample(uid, name):
	with pool.connection() as conn:
		exists = conn.execute('SELECT id FROM events.samples WHERE name = %s AND %s = ANY(authors)', [name, uid]).fetchone()
		if exists: raise ValueError('Already exists')
		conn.execute('INSERT INTO events.samples(name, authors) VALUES (%s, %s)', [name, (uid,)])

def remove_sample(uid, sid):
	with pool.connection() as conn:
		exists = conn.execute('SELECT id FROM events.samples WHERE name = %s AND %s = ANY(authors)', [name, uid]).fetchone()
		if not exists: raise ValueError('Not found or not authorized')
		conn.execute('DELETE FROM events.samples WHERE id = %s', [sid])

def update_sample(uid, sid, name, filters_json, whitelist=[], blacklist=[]):
	with pool.connection() as conn:
		exists = conn.execute('SELECT id FROM events.samples WHERE id = %s AND %s = ANY(authors)', [sid, uid]).fetchone()
		if not exists: raise ValueError('Not found or not authorized')
		conn.execute('UPDATE events.samples SET name=%s, filters=%s, whitelist=%s, blacklist=%s WHERE id=%s',
			[name, filters_json, whitelist, blacklist, sid])

def share_sample(uid, sid, target_uname):
	with pool.connection() as conn:
		target_id = conn.execute('SELECT id FROM users WHERE name = %s', [target_uname]).fetchone()
		if not target_id: raise ValueError('Target user not found')
		exists = conn.execute('SELECT id FROM events.samples WHERE id = %s AND %s = ANY(authors)', [sid, uid]).fetchone()
		if not exists: raise ValueError('Not found or not authorized')
		conn.execute('UPDATE events.samples tbl SET authors = array(select distinct unnest(tbl.authors || %s::integer)) WHERE id = %s', [target_id, sid])

def publish_sample(uid, sid, public):
	with pool.connection() as conn:
		exists = conn.execute('SELECT id FROM events.samples WHERE id = %s AND %s = ANY(authors)', [sid, uid]).fetchone()
		if not exists: raise ValueError('Not found or not authorized')
		conn.execute('UPDATE events.samples SET is_public = %s WHERE id = %s', [public, sid])