import { useContext } from 'react';
import { LayoutContext } from '../layout';
import { TableWithCursor } from './TableView';
import { valueToString } from './events';
import { color } from '../app';
import { useEventsState } from './eventsState';
import { useEruptTable } from './sources';

export default function EruptionsTable() {
	const { cursor } = useEventsState();

	const { id: nodeId, params, size } = useContext(LayoutContext)!;
	const context = useEruptTable();
	if (!context)
		return <div className='Center'>LOADING..</div>;
	const { columns, data } = context;

	const rowsHeight = size.height - 28;
	const rowH = devicePixelRatio < 1 ? 24 + (2 / devicePixelRatio) : 25;
	const viewSize = Math.floor(rowsHeight / rowH);
	const hRem = rowsHeight % rowH;
	const trPadding = hRem > viewSize ? 1 : 0;
	const headerPadding = (hRem - viewSize * trPadding);

	return <TableWithCursor {...{
		data, columns, size, viewSize, entity: 'eruptions',
		thead: <tr>{columns.map((col) =>
			<td key={col.id} title={`[${col.name}] ${col.description ?? ''}`} className='ColumnHeader'
				// onContextMenu={}
			>
				<div style={{ height: 20 + headerPadding, lineHeight: 1, fontSize: 15 }}>{col.name}</div>
			</td>)}
		</tr>,
		row: (row, idx, onClick) => {
			return <tr key={row[0]}
				style={{ height: 23 + trPadding, fontSize: 15 }}>
				{columns.map((column, cidx) => {
					const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
					const value = valueToString(row[cidx]);
					return <td key={column.id} title={`${column.fullName} = ${value}`}
						onClick={e => {
							onClick(idx, cidx);
						}}
						// onContextMenu={}
						style={{ borderColor: curs ? 'var(--color-active)' : 'var(--color-border)' }}>
						<span className='Cell' style={{ width: column.width + 'ch', color: color('text-dark')  }}>
							<div className='TdOver'/>
							{value}
						</span>
					</td>;
				})}
			</tr>;}
	}}/>;
}