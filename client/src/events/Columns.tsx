import { Fragment, useContext, useState } from 'react';
import { useEventListener } from '../util';
import { MainTableContext, prettyTable, useEventsSettings } from './events';
import { color } from '../plots/plotUtil';

export default function ColumnsSelector() {
	const { shownColumns, setColumns } = useEventsSettings();
	const { tables, columns } = useContext(MainTableContext);
	const [action, setAction] = useState(true);
	const [open, setOpen] = useState(false);

	useEventListener('escape', () => setOpen(false));
	useEventListener('action+openColumnsSelector', () => setOpen(o => !o));
	const check = (id: string, val: boolean) =>
		setColumns(cols => val ? cols.concat(id) : cols.filter(c => c !== id));
	
	return !open ? null : <>
		<div className='PopupBackground' onClick={() => setOpen(false)}/>
		<div className='Popup ColumnsSelector'>
			{tables.map(table => <Fragment key={table}>
				<button className='TextButton' onClick={() => setColumns(cols => [
					...cols.filter(c => columns.find(cc => cc.id === c)?.table !== table),
					...(!columns.find(cc => cc.table === table && cols.includes(cc.id)) ? columns.filter(c => c.table === table).map(c => c.id) : [])])}>
					<b><u>{prettyTable(table)}</u></b></button>
				{columns.filter(c => !c.hidden && c.table === table).map(({ id, name, description, generic }) =>
					<div key={id} style={{ color: generic ? color('text-dark') : color('text'), cursor: 'pointer' }}
						title={description} onMouseEnter={e => e.buttons === 1 && check(id, action)}
						onMouseDown={() => { const chk = !shownColumns.includes(id); setAction(chk); check(id, chk); }}>
						<input type='checkbox' style={{ marginRight: 8 }} checked={!!shownColumns.includes(id)} readOnly/>
						<button className='TextButton' style={{ flex: 1, textAlign: 'left', lineHeight: '1.1em' }}>{name}</button>
						{generic && <button style={{ fontSize: 18, height: 16, lineHeight: '16px', margin: '0 2px 4px 2px' }}
							title='Copy parameters' className='TextButton' onClick={() => setOpen(false)}>c</button>}
						{generic && <div className='CloseButton' onClick={() => setOpen(false)}/>}
					</div>)}
			</Fragment>)}
			<div style={{ width: 300, height: 400, borderLeft: '1px var(--color-border) solid', marginLeft: 8 }}>

			</div>
			<div className='CloseButton' style={{ position: 'absolute', top: 2, right: 4 }} onClick={() => setOpen(false)}/>
		</div>
	</>;
}