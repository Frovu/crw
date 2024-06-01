import { useContext } from 'react';
import { LayoutContext, type ContextMenuProps } from '../layout';
import { TableWithCursor } from './TableView';
import { equalValues, valueToString } from './events';
import { color, openContextMenu, useContextMenu } from '../app';
import { rowAsDict, useFeidCursor, useEventsState, useSource, useTable, type RowDict, flaresLinks } from './eventsState';
import { getSourceLink, linkEruptiveSourceEvent, unlinkEruptiveSourceEvent, useCompoundTable } from './sources';

export function FlaresContextMenu({ params, setParams }: ContextMenuProps<Partial<{}>>) {
	const detail = useContextMenu(state => state.menu?.detail) as { flare: RowDict } | undefined;
	const { id } = useFeidCursor();
	const flare = detail?.flare;
	const erupt = useSource('sources_erupt');
	const [linkColId, idColId] = getSourceLink('flare', flare?.src);
	const isLinked = flare && equalValues(flare[idColId], erupt?.[linkColId]);

	return !flare ? null : <>
		<button className='TextButton' style={{ color: color(erupt?.[linkColId] ? 'text-dark' : 'text') }}
			onClick={() => id && linkEruptiveSourceEvent('flare', flare, id)}>
				Link {flare.src as string} flare</button>
		{isLinked && <button className='TextButton' onClick={() => unlinkEruptiveSourceEvent('flare', flare)}>Unlink {flare.src as string} flare</button>}
	</>;
}

export default function FlaresTable() {
	const { cursor: sCursor } = useEventsState();
	const cursor = sCursor?.entity === 'flares' ? sCursor : null;
	const erupt = useSource('sources_erupt');
	const eruptions = useTable('sources_erupt');

	const { id: nodeId, size } = useContext(LayoutContext)!;
	const { columns, data } = useCompoundTable('flare');
	const { start: cursorTime, id: feidId } = useFeidCursor();
	if (!data.length)
		return <div className='Center'>LOADING..</div>;

	const rowsHeight = size.height - 28;
	const rowH = devicePixelRatio < 1 ? 24 + (2 / devicePixelRatio) : 25;
	const viewSize = Math.max(0, Math.floor(rowsHeight / rowH));
	const hRem = rowsHeight % rowH;
	const trPadding = hRem > viewSize ? 1 : 0;
	const headerPadding = (hRem - viewSize * trPadding);
	const [timeIdx] = ['start'].map(what => columns.findIndex(c => c.name === what));
	const focusTime = erupt?.flr_start ? (erupt?.flr_start as Date).getTime()
		: (cursorTime && (cursorTime.getTime() - 2 * 864e5));
	const focusIdx = focusTime == null ? data.length : data.findIndex(r =>
		(r[timeIdx] as Date)?.getTime() > focusTime);
	const linked = erupt && Object.fromEntries(Object.entries(flaresLinks).map(([src, lnk]) => [src, erupt[lnk[0]]]));

	return <TableWithCursor {...{
		entity: 'flares',
		data, columns, size, viewSize, focusIdx, onKeydown: e => {
			if (cursor && erupt && e.key === '-')
				return unlinkEruptiveSourceEvent('flare', rowAsDict(data[cursor.row] as any, columns));
			if (cursor && ['+', '='].includes(e.key))
				return feidId && linkEruptiveSourceEvent('flare', rowAsDict(data[cursor.row] as any, columns), feidId);
		},
		thead: <tr>{columns.map((col) =>
			<td key={col.id} title={`[${col.name}] ${col.description ?? ''}`} className='ColumnHeader' style={{ cursor: 'auto' }}>
				<div style={{ height: 20 + headerPadding, lineHeight: 1, fontSize: 15 }}>{col.name}</div>
			</td>)}
		</tr>,
		row: (row, idx, onClick) => {
			const flare = rowAsDict(row as any, columns);
			const stime = (flare.start_time as any)?.getTime();
			const [linkColId, idColId] = getSourceLink('flare', flare.src);
			const isLinked = equalValues(flare[idColId], linked?.[flare.src as any]);
			const isPrime = isLinked && erupt?.flr_source === flare.src;
			const otherLinked = !isLinked && linked?.[flare.src as any];
			const darkk = otherLinked || (!erupt?.flr_start ?
				stime > focusTime! + 864e5    || stime < focusTime! - 3 * 864e5 : 
				stime > focusTime! + 36e5 * 4 || stime < focusTime! - 36e5 * 4);

			// FIXME: this is probably slow
			const eruptLinkIdx = !darkk && eruptions.columns?.findIndex(col => col.id === linkColId);
			const dark = darkk || (eruptLinkIdx && eruptions.data?.find(eru =>
				equalValues(flare[idColId], eru[eruptLinkIdx])));
		
			return <tr key={row[0]+stime+(flare.end_time as any)?.getTime()}
				style={{ height: 23 + trPadding, fontSize: 15 }}>
				{columns.map((column, cidx) => {
					const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
					let value = valueToString(row[cidx]);
					if (['peak', 'end'].includes(column.name))
						value = value.split(' ')[1];
					return <td key={column.id} title={`${column.fullName} = ${value}`}
						onClick={e => {
							if (cidx === 0) {
								feidId && linkEruptiveSourceEvent('flare', rowAsDict(row as any, columns), feidId);
								return;
							}
							onClick(idx, cidx);
						}}
						onContextMenu={openContextMenu('events', { nodeId, flare } as any)}
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