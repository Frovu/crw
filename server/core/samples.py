from core.database import pool

def _init():
	with pool.connection() as conn:
		conn.execute('''CREATE TABLE IF NOT EXISTS events.samples (
			id SERIAL PRIMARY KEY,
			created TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			last_modified TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			name TEXT NOT NULL,
			authors int[],
			public BOOLEAN NOT NULL DEFAULT 'f',
			filters JSON,
			whitelist int[] NOT NULL DEFAULT '{}',
			blacklist int[] NOT NULL DEFAULT '{}',
			UNIQUE (name, authors))''')
_init()

def select(uid=None):
	with pool.connection() as conn:
		curs = conn.execute('SELECT id, name, array(select login from users where uid = ANY(authors) order by login) as authors, public, filters, whitelist, blacklist ' + 
		'FROM events.samples WHERE public' + ('' if uid is None else ' OR %s = ANY(authors)'), [] if uid is None else [uid])
		rows, fields = curs.fetchall(), [desc[0] for desc in curs.description]
		return [{ f: val for val, f in zip(row, fields) } for row in rows]

def create_sample(uid, name):
	with pool.connection() as conn:
		exists = conn.execute('SELECT id FROM events.samples WHERE name = %s AND %s = ANY(authors)', [name, uid]).fetchone()
		if exists:
			raise ValueError('Already exists')
		curs = conn.execute('INSERT INTO events.samples(name, authors) VALUES (%s, %s) RETURNING '+
		'id, name, array(select login from users where uid = ANY(authors)) as authors, public, filters, whitelist, blacklist', [name, [uid,]])
		return { f: val for val, f in zip(curs.fetchone(), [desc[0] for desc in curs.description]) }

def remove_sample(uid, sid):
	with pool.connection() as conn:
		exists = conn.execute('SELECT id FROM events.samples WHERE id = %s AND %s = ANY(authors)', [sid, uid]).fetchone()
		if not exists:
			raise ValueError('Not found or not authorized')
		conn.execute('DELETE FROM events.samples WHERE id = %s', [sid])

def update_sample(uid, sid, name, authors, public, filters_json, whitelist=[], blacklist=[]):
	with pool.connection() as conn:
		exists = conn.execute('SELECT id FROM events.samples WHERE id = %s AND %s = ANY(authors)', [sid, uid]).fetchone()
		if not exists:
			raise ValueError('Not found or not authorized')
		found_authors = conn.execute('SELECT name, uid FROM (SELECT DISTINCT UNNEST(%s::text[])) AS q(name) LEFT JOIN users ON login = name', [authors]).fetchall()
		_, author_ids = zip(*found_authors)
		if uid not in author_ids:
			raise ValueError('Can\'t relinquish authorship')
		for aname, uid in found_authors:
			if not uid:
				raise ValueError('User not found: '+aname)
		conn.execute('UPDATE events.samples SET name=%s, authors=%s, public=%s, filters=%s, whitelist=%s, blacklist=%s WHERE id=%s',
			[name, list(author_ids), public, filters_json, whitelist, blacklist, sid])
