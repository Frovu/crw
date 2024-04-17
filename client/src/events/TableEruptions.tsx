import { useContext } from 'react';
import { LayoutContext } from '../layout';
import { TableWithCursor } from './TableView';
import { valueToString, type TableMenuDetails } from './events';
import { color, logError, openContextMenu, useContextMenu } from '../app';
import { deleteEvent, useEventsState, useSources, useTable } from './eventsState';
import { useTableQuery } from './sources';
import { apiPost } from '../util';
import { askConfirmation } from '../Utility';

const ENT = 'sources_erupt';

type EruptiuonMenuDetail = {
	id: number
};

function deleteEruption(id: number) {
	askConfirmation(<><h4>Delete eruption event?</h4><p>Action is irreversible</p></>, async () => {
		try {
			await apiPost('events/delete', { entity: ENT, id });
			deleteEvent(ENT, id);
		} catch(e) {
			logError(e?.toString());
		}
	});
}

export function EruptionsContextMenu() {
	const { data, columns } = useTable(ENT);
	const detail = useContextMenu(state => state.menu?.detail) as TableMenuDetails | undefined;
	const eruptId = detail?.cell?.id;

	return <>
		{eruptId && <button className='TextButton' onClick={() => deleteEruption(eruptId)}>Delete row</button>}
	</>;
}

export default function EruptionsTable() {
	const { cursor } = useEventsState();
	const { data, columns } = useTable(ENT);
	const sources = useSources();

	useTableQuery(ENT);

	const { id: nodeId, params, size } = useContext(LayoutContext)!;
	if (!data || !columns)
		return <div className='Center'>LOADING..</div>;
	const rowsHeight = size.height - 28;
	const rowH = devicePixelRatio < 1 ? 27 + (2 / devicePixelRatio) : 28;
	const viewSize = Math.max(0, Math.floor(rowsHeight / rowH));
	const hRem = rowsHeight % rowH;
	const trPadding = hRem > viewSize ? 1 : 0;
	const headerPadding = (hRem - viewSize * trPadding);

	return <TableWithCursor {...{
		data, columns, size, viewSize, entity: 'eruptions',
		thead: <tr>{columns.map((col) =>
			<td key={col.id} title={`[${col.name}] ${col.description ?? ''}`} className='ColumnHeader'>
				<div style={{ height: 26 + headerPadding, lineHeight: 1, fontSize: 15 }}>{col.name}</div>
			</td>)}
		</tr>,
		row: (row, idx, onClick) => {
			const dark = !sources.find(src => src.erupt?.id === row[0]);
			return <tr key={row[0]}
				style={{ height: 23 + trPadding, fontSize: 15 }}>
				{columns.map((column, cidx) => {
					const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
					let value = valueToString(row[cidx]);
					if (['XF peak', 'XF end'].includes(column.name))
						value = value.split(' ')[1];
					const width = ['XF peak', 'XF end'].includes(column.name) ? 6 : column.name.endsWith('src') ? 6 : column.width;
					return <td key={column.id} title={`${column.fullName} = ${value}`}
						onClick={e => {
							onClick(idx, cidx);
						}}
						onContextMenu={openContextMenu('events', { nodeId, cell: { id: row[0] } as any })}
						style={{ borderColor: curs ? 'var(--color-active)' : 'var(--color-border)' }}>
						<span className='Cell' style={{ width: width + 'ch', color: color(dark ? 'text-dark' : 'text')  }}>
							<div className='TdOver'/>
							{value}
						</span>
					</td>;
				})}
			</tr>;}
	}}/>;
}