from database import pool
from events.table_structure import ColumnDef

TABLE = 'legacy_noaa_flares'

Col = lambda *args, **kwargs: ColumnDef(TABLE, *args, **kwargs, rel='FLR')

COLS =[
	Col('start_time', not_null=True, sql='start_time timestamptz PRIMARY KEY', data_type='time', pretty_name='start'),
	Col('peak_time', not_null=True, data_type='time', pretty_name='peak'),
	Col('end_time', not_null=True, data_type='time', pretty_name='end'),
	Col('class', data_type='text'),
	Col('lat'),
	Col('lon'),
	Col('active_region', data_type='integer', pretty_name='AR'),
	Col('psi', pretty_name='psi'),
	Col('gle', pretty_name='GLE'),
	Col('dt_p10', pretty_name='dtp10'),
	Col('p10', pretty_name='p>10'),
	Col('p60', pretty_name='p>60'),
	Col('p100', pretty_name='p>100'),
	Col('note', data_type='text'),
]

def _init():
	cols = ',\n'.join([c.sql for c in COLS if c])
	query = f'CREATE TABLE IF NOT EXISTS events.{TABLE} (\n{cols})'
	with pool.connection() as conn:
		conn.execute(query)
_init()
