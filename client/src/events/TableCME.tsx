import { useContext } from 'react';
import { useContextMenu, openContextMenu, color } from '../app';
import { LayoutContext, openWindow, type ContextMenuProps } from '../layout';
import { TableWithCursor } from './TableView';
import { equalValues, valueToString } from './events';
import { cmeLinks, rowAsDict, useEventsState, useFeidCursor, useSource, useSources, useTable, type RowDict } from './eventsState';
import { getSourceLink, linkEruptiveSourceEvent, sourceLabels, timeInMargin, unlinkEruptiveSourceEvent, useCompoundTable } from './sources';

export function CMEContextMenu({ params, setParams }: ContextMenuProps<Partial<{}>>) {
	const detail = useContextMenu(state => state.menu?.detail) as { cme: RowDict } | undefined;
	const { id } = useFeidCursor();
	const cme = detail?.cme;
	const erupt = useSource('sources_erupt');
	const src = cme?.src as string;
	const [linkColId, idColId] = getSourceLink('cme', src);
	const isLinked = cme && equalValues(cme[idColId], erupt?.[linkColId]);

	return !cme ? null : <>
		<button className='TextButton' style={{ color: color(erupt?.[linkColId] ? 'text-dark' : 'text') }}
			onClick={() => id && linkEruptiveSourceEvent('cme', cme, id)}>
				Link {src} CME</button>
		{isLinked && <button className='TextButton' onClick={() => unlinkEruptiveSourceEvent('cme', cme)}>Unlink {src} CME</button>}
		<button  className='TextButton' onClick={e => openWindow({
			x: e.clientX, y: e.clientY, w: 400, h: 200, params: { type: 'Sun View', mode: 'WSA-ENLIL' } as any
		})}>Open ENLIL view</button>
	</>;
}

export default function CMETable() {
	const { cursor: sCursor } = useEventsState();
	const cursor = sCursor?.entity === 'CMEs' ? sCursor : null;
	const erupt = useSource('sources_erupt');
	const eruptions = useTable('sources_erupt');
	const icmes = useCompoundTable('icme');
	const sources = useSources();

	const { id: nodeId, size } = useContext(LayoutContext)!;
	const { columns, data } = useCompoundTable('cme');
	const { start: cursorTime, id: feidId, row: feid } = useFeidCursor();
	if (!data.length)
		return <div className='Center'>LOADING..</div>;

	const rowsHeight = size.height - 28;
	const rowH = devicePixelRatio < 1 ? 24 + (2 / devicePixelRatio) : 25;
	const viewSize = Math.max(0, Math.floor(rowsHeight / rowH));
	const hRem = rowsHeight % rowH;
	const trPadding = hRem > viewSize ? 1 : 0;
	const headerPadding = (hRem - viewSize * trPadding);
	const focusTime = erupt?.cme_time ? (erupt?.cme_time as Date).getTime()
		: erupt?.flr_start ? (erupt?.flr_start as Date).getTime()
			: (cursorTime && (cursorTime.getTime() - 2 * 864e5));
	const focusIdx = focusTime == null ? data.length :
		data.findIndex(r => (r[1] as Date)?.getTime() > focusTime);
	const linked = erupt && Object.fromEntries(
		sourceLabels.cme.map((src) => [src, erupt[cmeLinks[src][0]]]));

	return <TableWithCursor {...{
		entity: 'CMEs',
		data, columns, size, viewSize, focusIdx, onKeydown: e => {
			if (cursor && erupt && e.key === '-')
				return unlinkEruptiveSourceEvent('cme', rowAsDict(data[cursor.row] as any, columns));
			if (cursor && ['+', '='].includes(e.key))
				return feidId && linkEruptiveSourceEvent('cme', rowAsDict(data[cursor.row] as any, columns), feidId);
		},
		thead: <tr>{columns.map((col) =>
			<td key={col.id} title={`[${col.name}] ${col.description ?? ''}`} className='ColumnHeader' style={{ cursor: 'auto' }}>
				<div style={{ height: 20 + headerPadding, lineHeight: 1, fontSize: 15 }}>{col.name}</div>
			</td>)}
		</tr>,
		row: (row, idx, onClick) => {
			const cme = rowAsDict(row as any, columns);
			const time = (cme.time as any)?.getTime();
			const [linkColId, idColId] = getSourceLink('cme', cme.src);
			const isLinked = equalValues(cme[idColId], linked?.[cme.src as any]);
			const isPrime = isLinked && erupt?.cme_source === cme.src;
			const otherLinked = !isLinked && linked?.[cme.src as any];
			const linkedToAnyErupt = sources.find(s => equalValues(s.erupt?.[linkColId], cme[idColId]));

			const orange = !isLinked && !otherLinked && !linkedToAnyErupt && (() => {
				if (timeInMargin(cme.time, erupt?.cme_time, 6e5))
					return true;
				if (cme.linked_events && (cme.linked_events as any as string[]).find(lnk =>
					lnk.includes('GST') && timeInMargin(cme.time, new Date(lnk.slice(0, 19) + 'Z'), 8 * 36e5)))
					return true;
				if (feid.cme_time) {
					if (timeInMargin(cme.time, feid.cme_time, 6e5))
						return true;
				}
				const anyEruptIcme = sources.find(s => s.erupt?.rc_icme_time)?.erupt?.rc_icme_time;
				if (anyEruptIcme) {
					const icmeTimeIdx = icmes.columns.findIndex(c => c.name === 'time');
					const icme = rowAsDict(icmes.data.find(r => equalValues(anyEruptIcme, r[icmeTimeIdx])), icmes.columns);
					for (const meTime of icme.cmes_time as any as string[])
						if (timeInMargin(cme.time, new Date(meTime.slice(0, 19) + 'Z'), 6e5))
							return true;
				}
				return false;
			})();

			const darkk = !orange && (otherLinked || (!erupt?.cme_time ?
				time > focusTime! + 864e5    || time < focusTime! - 3 * 864e5 : 
				time > focusTime! + 36e5 * 4 || time < focusTime! - 36e5 * 4));

			const eruptLinkIdx = !darkk && eruptions.columns?.findIndex(col => col.id === linkColId);
			const dark = !orange && (darkk || (eruptLinkIdx && eruptions.data?.find(eru =>
				equalValues(cme[idColId], eru[eruptLinkIdx])))); 
		
			return <tr key={row[0]+time+row[2]+row[4]}
				style={{ height: 23 + trPadding, fontSize: 15 }}>
				{columns.map((column, cidx) => {
					const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
					const value = valueToString(row[cidx]);
					return <td key={column.id} title={`${column.fullName} = ${value}`}
						onClick={e => {
							if (cidx === 0) {
								feidId && linkEruptiveSourceEvent('cme', rowAsDict(row as any, columns), feidId);
								return;
							}
							onClick(idx, cidx);
						}}
						onContextMenu={openContextMenu('events', { nodeId, cme } as any)}
						style={{ borderColor: color(curs ? 'active' : 'border') }}>
						<span className='Cell' style={{ width: column.width + 'ch',
							color: color(isLinked ? 'cyan' : orange ? 'orange' : dark ? 'text-dark' : 'text'),
							fontWeight: (isPrime) ? 'bold' : 'unset' }}>
							<div className='TdOver'/>
							{value}
						</span>
					</td>;
				})}
			</tr>;}
	}}/>;
}