import { Fragment, useContext, useState } from 'react';
import { useEventListener } from '../util';
import { MainTableContext, prettyTable, useEventsSettings } from './events';

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
			{tables.map((table, i) => <Fragment key={table}>
				<button className='TextButton' onClick={() => setColumns(cols => [
					...cols.filter(c => columns.find(cc => cc.id === c)?.table !== table),
					...(!columns.find(cc => cc.table === table && cols.includes(cc.id)) ? columns.filter(c => c.table === table).map(c => c.id) : [])])}>
					<b><u>{prettyTable(table)}</u></b></button>
				{columns.filter(c => !c.hidden && c.table === table).map(({ id, name }) =>
					<label key={id} onMouseEnter={e => e.buttons === 1 && check(id, action)}
						onMouseDown={() => { const chk = !shownColumns.includes(id); setAction(chk); check(id, chk); }}>
						<input type='checkbox' style={{ marginRight: 8 }} checked={!!shownColumns.includes(id)} readOnly/>
						{name}
					</label>)}
			</Fragment>)}
			<div className='CloseButton' style={{ position: 'absolute', width: '1em',
				top: 4, right: 4 }} onClick={() => setOpen(false)}/>
		</div>
	</>;
}