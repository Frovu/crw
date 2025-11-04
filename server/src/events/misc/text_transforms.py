from database import pool, log

def _init():
	with pool.connection() as conn:
		conn.execute('''CREATE TABLE IF NOT EXISTS events.text_transform_sets (
			id SERIAL PRIMARY KEY,
			author INTEGER NOT NULL,
			created TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			modified TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			name TEXT NOT NULL,
			public BOOLEAN NOT NULL DEFAULT 'f',
			transforms JSON NOT NULL,
			UNIQUE (name, author))''')
_init()

def select(uid=None):
	with pool.connection() as conn:
		curs = conn.execute('SELECT id, name, (select login from users where uid = author) as author, ' +\
		'public, created, modified, transforms FROM events.text_transform_sets ' + 
		'WHERE public ' + ('' if uid is None else ' OR %s = author ') +\
			'ORDER BY name', [] if uid is None else [uid])
		rows, fields = curs.fetchall(), [desc[0] for desc in curs.description]
		return [{ f: val for val, f in zip(row, fields) } for row in rows]

def remove(uid, name):
	with pool.connection() as conn:
		curs = conn.execute('DELETE FROM events.text_transform_sets WHERE name = %s AND %s = author', [name, uid])
		if curs.rowcount < 1:
			raise ValueError('Not found or not authorized')
		log.info('Text transform removed by user #%s: %s', uid, name)

def upsert(uid, name: str, public: bool, transforms: str):
	with pool.connection() as conn:
		conn.execute('INSERT INTO events.text_transform_sets (author, name, public, transforms) VALUES (%s, %s, %s, %s)' +\
			'ON CONFLICT(author, name) DO UPDATE SET public = EXCLUDED.public, ' +\
				'transforms = EXCLUDED.transforms, modified = CURRENT_TIMESTAMP', [uid, name, public, transforms])
		log.info('Text transform set saved by user #%s: %s', uid, name)
