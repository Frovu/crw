from database import create_table
from events.columns.column import Column as Col

TABLE = 'legacy_noaa_flares'

COLS =[
	Col(TABLE, 'start_time', not_null=True, sql_def='timestamptz PRIMARY KEY', dtype='time', name='start'),
	Col(TABLE, 'peak_time', not_null=True, dtype='time', name='peak'),
	Col(TABLE, 'end_time', not_null=True, dtype='time', name='end'),
	Col(TABLE, 'class', dtype='text'),
	Col(TABLE, 'lat'),
	Col(TABLE, 'lon'),
	Col(TABLE, 'active_region', dtype='integer', name='AR'),
	Col(TABLE, 'psi', name='psi'),
	Col(TABLE, 'gle', name='GLE'),
	Col(TABLE, 'dt_p10', name='dtp10'),
	Col(TABLE, 'p10', name='p>10'),
	Col(TABLE, 'p60', name='p>60'),
	Col(TABLE, 'p100', name='p>100'),
	Col(TABLE, 'note', dtype='text'),
]

def _init():
	create_table(TABLE, COLS)
_init()
