from database import pool
from events.columns.column_def import ColumnDef

TABLE = 'legacy_noaa_flares'

Col = lambda *args, **kwargs: ColumnDef(TABLE, *args, **kwargs, rel='FLR')

COLS =[
	Col('start_time', not_null=True, sql='start_time timestamptz PRIMARY KEY', dtype='time', name='start'),
	Col('peak_time', not_null=True, dtype='time', name='peak'),
	Col('end_time', not_null=True, dtype='time', name='end'),
	Col('class', dtype='text'),
	Col('lat'),
	Col('lon'),
	Col('active_region', dtype='integer', name='AR'),
	Col('psi', name='psi'),
	Col('gle', name='GLE'),
	Col('dt_p10', name='dtp10'),
	Col('p10', name='p>10'),
	Col('p60', name='p>60'),
	Col('p100', name='p>100'),
	Col('note', dtype='text'),
]

def _init():
	cols = ',\n'.join([c.sql for c in COLS if c])
	query = f'CREATE TABLE IF NOT EXISTS events.{TABLE} (\n{cols})'
	with pool.connection() as conn:
		conn.execute(query)
_init()
