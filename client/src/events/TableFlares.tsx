import { useContext } from 'react';
import { LayoutContext } from '../layout';
import { TableWithCursor } from './TableView';
import { valueToString } from './events';
import { color } from '../app';
import { useCursor, useEventsState } from './eventsState';
import { useFlaresTable } from './sources';

export function FlaresContextMenu() {
	
}

export default function FlaresTable() {
	const { cursor } = useEventsState();

	const { params, size } = useContext(LayoutContext)!;
	const context = useFlaresTable();
	const { start: cursorTime } = useCursor();
	if (!context)
		return <div className='Center'>LOADING..</div>;
	const { columns, data } = context;

	const rowsHeight = size.height - 28;
	const rowH = devicePixelRatio < 1 ? 24 + (2 / devicePixelRatio) : 25;
	const viewSize = Math.max(0, Math.floor(rowsHeight / rowH));
	const hRem = rowsHeight % rowH;
	const trPadding = hRem > viewSize ? 1 : 0;
	const headerPadding = (hRem - viewSize * trPadding);
	const [timeIdx, classIdx] = ['start', 'class'].map(what => columns.findIndex(c => c.name === what));
	const focusIdx = data.findIndex(r =>
		(r[timeIdx] as Date)?.getTime() > cursorTime!.getTime() - 2 * 864e5);

	return <TableWithCursor {...{
		entity: 'flares',
		data, columns, size, viewSize, focusIdx,
		thead: <tr>{columns.map((col) =>
			<td key={col.id} title={`[${col.name}] ${col.description ?? ''}`} className='ColumnHeader' style={{ cursor: 'auto' }}
				// onContextMenu={}
			>
				<div style={{ height: 20 + headerPadding, lineHeight: 1, fontSize: 15 }}>{col.name}</div>
			</td>)}
		</tr>,
		row: (row, idx, onClick) => {
			const stime = row[timeIdx]?.getTime();
			const curTime = cursorTime!.getTime();
			const isFar = !['M', 'X', 'C'].includes(row[classIdx]?.at(0))
				|| stime > curTime - 864e5 || stime < curTime - 5 * 864e5; 
			return <tr key={row[0]+stime+row[timeIdx+2]?.getTime()}
				style={{ height: 23 + trPadding, fontSize: 15 }}>
				{columns.map((column, cidx) => {
					const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
					const value = valueToString(row[cidx]);
					return <td key={column.id} title={`${column.fullName} = ${value}`}
						onClick={e => {
							onClick(idx, cidx);
						}}
						// onContextMenu={}
						style={{ borderColor: color(curs ? 'active' : 'border') }}>
						<span className='Cell' style={{ width: column.width + 'ch', color: color(isFar ? 'text-dark' : 'text')  }}>
							<div className='TdOver'/>
							{value}
						</span>
					</td>;
				})}
			</tr>;}
	}}/>;
}