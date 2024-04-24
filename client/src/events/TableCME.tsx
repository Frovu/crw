import { useContext } from 'react';
import { useContextMenu, openContextMenu, color } from '../app';
import { LayoutContext } from '../layout';
import { TableWithCursor } from './TableView';
import { equalValues, valueToString } from './events';
import { rowAsDict, useEventsState, useFeidCursor, useSource, useTable, type RowDict } from './eventsState';
import { cmeLinks, useCMETable } from './sources';

function linkCME(cme: RowDict, feidId: number) {

}

function unlinkCME(cme: RowDict) {

}

export function CMEContextMenu() {
	const detail = useContextMenu(state => state.menu?.detail) as { cme: RowDict } | undefined;
	const { id } = useFeidCursor();
	const cme = detail?.cme;
	const erupt = useSource('sources_erupt');
	const src = cme?.src as keyof typeof cmeLinks;
	const [linkColId, idColId] = cmeLinks[src];
	const isLinked = cme && equalValues(cme[idColId], erupt?.[linkColId]);

	return !cme ? null : <>
		<button className='TextButton' style={{ color: color(erupt?.[linkColId] ? 'text-dark' : 'text') }}
			onClick={() => id && linkCME(cme, id)}>
				Link {src} CME</button>
		{isLinked && <button className='TextButton' onClick={() => unlinkCME(cme)}>Unlink {src} CME</button>}
	</>;
}

export default function CMETable() {
	const { cursor: sCursor, modifySource } = useEventsState();
	const cursor = sCursor?.entity === 'CMEs' ? sCursor : null;
	const erupt = useSource('sources_erupt');
	const eruptions = useTable('sources_erupt');

	const { id: nodeId, size } = useContext(LayoutContext)!;
	const { columns, data } = useCMETable();
	const { start: cursorTime, id: feidId } = useFeidCursor();
	if (!data.length)
		return <div className='Center'>LOADING..</div>;

	const rowsHeight = size.height - 28;
	const rowH = devicePixelRatio < 1 ? 24 + (2 / devicePixelRatio) : 25;
	const viewSize = Math.max(0, Math.floor(rowsHeight / rowH));
	const hRem = rowsHeight % rowH;
	const trPadding = hRem > viewSize ? 1 : 0;
	const headerPadding = (hRem - viewSize * trPadding);
	const focusTime = erupt?.cme_time ? (erupt?.cme_time as Date).getTime()
		: (cursorTime && (cursorTime.getTime() - 2 * 864e5));
	const focusIdx = focusTime == null ? data.length :
		data.findIndex(r => (r[1] as Date)?.getTime() > focusTime);
	const linked = erupt && Object.fromEntries(
		Object.entries(cmeLinks).map(([src, linkId]) => [src, erupt[linkId[0]]]));

	return <TableWithCursor {...{
		entity: 'CMEs',
		data, columns, size, viewSize, focusIdx, onKeydown: e => {
			if (cursor && erupt && e.key === '-')
				return unlinkCME(rowAsDict(data[cursor.row] as any, columns));
			if (cursor && ['+', '='].includes(e.key))
				return feidId && linkCME(rowAsDict(data[cursor.row] as any, columns), feidId);
		},
		thead: <tr>{columns.map((col) =>
			<td key={col.id} title={`[${col.name}] ${col.description ?? ''}`} className='ColumnHeader' style={{ cursor: 'auto' }}>
				<div style={{ height: 20 + headerPadding, lineHeight: 1, fontSize: 15 }}>{col.name}</div>
			</td>)}
		</tr>,
		row: (row, idx, onClick) => {
			const cme = rowAsDict(row as any, columns);
			const time = (cme.time as any)?.getTime();
			const [linkColId, idColId] = cmeLinks[cme.src as keyof typeof cmeLinks];
			const isLinked = equalValues(cme[idColId], linked?.[cme.src as any]);
			const isPrime = isLinked && erupt?.cme_source === cme.src;
			const otherLinked = !isLinked && linked?.[cme.src as any];
			const darkk = otherLinked || (!erupt?.cme_time ?
				time > focusTime! + 864e5    || time < focusTime! - 3 * 864e5 : 
				time > focusTime! + 36e5 * 4 || time < focusTime! - 36e5 * 4);

			// FIXME: this is probably slow
			const eruptLinkIdx = !darkk && eruptions.columns?.findIndex(col => col.id === linkColId);
			const dark = darkk || (eruptLinkIdx && eruptions.data?.find(eru =>
				equalValues(cme[idColId], eru[eruptLinkIdx]))); 
		
			return <tr key={row[0]+time+row[2]+row[4]}
				style={{ height: 23 + trPadding, fontSize: 15 }}>
				{columns.map((column, cidx) => {
					const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
					let value = valueToString(row[cidx]);
					if (['peak', 'end'].includes(column.name))
						value = value.split(' ')[1];
					return <td key={column.id} title={`${column.fullName} = ${value}`}
						onClick={e => {
							if (cidx === 0) {
								modifySource && feidId && linkCME(rowAsDict(row as any, columns), feidId);
								return;
							}
							onClick(idx, cidx);
						}}
						onContextMenu={openContextMenu('events', { nodeId, cme } as any)}
						style={{ borderColor: color(curs ? 'active' : 'border') }}>
						<span className='Cell' style={{ width: column.width + 'ch',
							color: color(isLinked ? 'cyan' : dark ? 'text-dark' : 'text'),
							fontWeight: (isPrime) ? 'bold' : 'unset' }}>
							<div className='TdOver'/>
							{value}
						</span>
					</td>;
				})}
			</tr>;}
	}}/>;
}