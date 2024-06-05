import { useContext } from 'react';
import { useContextMenu, openContextMenu, color } from '../app';
import { LayoutContext, type ContextMenuProps } from '../layout';
import { TableWithCursor } from './TableView';
import { equalValues, valueToString } from './events';
import { icmeLinks, rowAsDict, useEventsState, useFeidCursor, useSource, useSources, type RowDict } from './eventsState';
import { getSourceLink, linkEruptiveSourceEvent, sourceLabels, timeInMargin, unlinkEruptiveSourceEvent, useCompoundTable } from './sources';

export function ICMEContextMenu({ params, setParams }: ContextMenuProps<Partial<{}>>) {
	const detail = useContextMenu(state => state.menu?.detail) as { icme: RowDict } | undefined;
	const { id } = useFeidCursor();
	const icme = detail?.icme;
	const erupt = useSource('sources_erupt');
	const src = icme?.src as string;
	const [linkColId, idColId] = getSourceLink('icme', src);
	const isLinked = icme && equalValues(icme[idColId], erupt?.[linkColId]);

	return !icme ? null : <>
		<button className='TextButton' style={{ color: color(erupt?.[linkColId] ? 'text-dark' : 'text') }}
			onClick={() => id && linkEruptiveSourceEvent('icme', icme, id)}>
				Link {src} ICME</button>
		{isLinked && <button className='TextButton' onClick={() => unlinkEruptiveSourceEvent('icme', icme)}>Unlink {src} ICME</button>}
	</>;
}

export default function ICMETable() {
	const { cursor: sCursor } = useEventsState();
	const cursor = sCursor?.entity === 'ICMEs' ? sCursor : null;
	const erupt = useSource('sources_erupt');
	const sources = useSources();
	// const eruptions = useTable('sources_erupt');

	const { id: nodeId, size } = useContext(LayoutContext)!;
	const { columns, data } = useCompoundTable('icme');
	const { start: cursorTime, row: feid, id: feidId } = useFeidCursor();
	if (!data.length)
		return <div className='Center'>LOADING..</div>;

	const rowsHeight = size.height - 28;
	const rowH = devicePixelRatio < 1 ? 24 + (2 / devicePixelRatio) : 25;
	const viewSize = Math.max(0, Math.floor(rowsHeight / rowH));
	const hRem = rowsHeight % rowH;
	const trPadding = hRem > viewSize ? 1 : 0;
	const headerPadding = (hRem - viewSize * trPadding);
	const focusTime = cursorTime?.getTime();
	const focusIdx = focusTime == null ? data.length :
		data.findIndex(r => (r[1] as Date)?.getTime() > focusTime);
	const linked = erupt && Object.fromEntries(
		sourceLabels.icme.map((src) => [src, erupt[icmeLinks[src][0]]]));

	return <TableWithCursor {...{
		entity: 'ICMEs',
		data, columns, size, viewSize, focusIdx, onKeydown: e => {
			if (cursor && erupt && e.key === '-')
				return unlinkEruptiveSourceEvent('icme', rowAsDict(data[cursor.row] as any, columns));
			if (cursor && ['+', '='].includes(e.key))
				return feidId && linkEruptiveSourceEvent('icme', rowAsDict(data[cursor.row] as any, columns), feidId);
		},
		thead: <tr>{columns.map((col) =>
			<td key={col.id} title={`[${col.name}] ${col.description ?? ''}`} className='ColumnHeader' style={{ cursor: 'auto' }}>
				<div style={{ height: 20 + headerPadding, lineHeight: 1, fontSize: 15 }}>{col.name}</div>
			</td>)}
		</tr>,
		row: (row, idx, onClick) => {
			const icme = rowAsDict(row as any, columns);
			const time = (icme.time as any)?.getTime();
			const isLinked = equalValues(icme.time, linked?.[icme.src as any]);
			const linkedToAnyErupt = sources.find(s => equalValues(s.erupt?.[getSourceLink('icme', icme.src)[0]], icme.time));
			
			const orange = !isLinked && !linkedToAnyErupt
				&& (timeInMargin(icme.time, cursorTime, 36e5) 
					|| (feid.mc_time && timeInMargin(icme.body_start, feid.mc_time, 36e5)));
			const dark = linkedToAnyErupt || (!orange && !timeInMargin(icme.time, cursorTime, 24 * 36e5));
		
			return <tr key={row[0]+time+row[2]+row[4]}
				style={{ height: 23 + trPadding, fontSize: 15 }}>
				{columns.map((column, cidx) => {
					const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
					const value = valueToString(row[cidx]);
					return <td key={column.id} title={`${column.fullName} = ${value}`}
						onClick={e => {
							if (cidx === 0) {
								if (feidId)
									linkEruptiveSourceEvent('icme', rowAsDict(row as any, columns), feidId);
								return;
							}
							onClick(idx, cidx);
						}}
						onContextMenu={openContextMenu('events', { nodeId, icme } as any)}
						style={{ borderColor: color(curs ? 'active' : 'border') }}>
						<span className='Cell' style={{ width: column.width + 'ch',
							color: color(isLinked ? 'cyan' : dark ? 'text-dark' : orange ? 'orange' : 'text') }}>
							<div className='TdOver'/>
							{value}
						</span>
					</td>;
				})}
			</tr>;}
	}}/>;
}