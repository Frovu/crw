
from events.table import ColumnDef


TABLE = 'izmiran_flares'

Col = lambda *args, **kwargs: ColumnDef(TABLE, *args, **kwargs)

COLS =[
	Col('start_time', not_null=True, sql='start_time timestamptz PRIMARY KEY', data_type='time', pretty_name='start'),
	Col('class', type='text'),
	Col('flux'),
	Col('lat'),
	Col('lon'),
	Col('dt'),
	Col('dt1'),
	Col('dt2'),
	Col('psi', pretty_name='psi'),
	Col('gle', pretty_name='GLE'),
	Col('dt_p10', pretty_name='dtp10'),
	Col('p10', pretty_name='p>10'),
	Col('p60', pretty_name='p>60'),
	Col('p100', pretty_name='p>100'),
]