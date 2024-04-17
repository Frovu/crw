import { useContext } from 'react';
import { LayoutContext } from '../layout';
import { TableWithCursor } from './TableView';
import { valueToString } from './events';
import { color, logError, logMessage, openContextMenu, useContextMenu } from '../app';
import { eruptIdIdx, makeChange, makeSourceChanges, rowAsDict, useFeidCursor, useEventsState, useSource, useTable, type RowDict } from './eventsState';
import { flaresLinkId, useFlaresTable } from './sources';
import { apiPost } from '../util';
import { askConfirmation, askProceed } from '../Utility';

function parseFlareFlux(cls: string | null) {
	if (!cls) return null;
	const multi = (() => {
		switch (cls.at(0)) {
			case 'A': return .1;
			case 'B': return 1;
			case 'C': return 10;
			case 'M': return 100;
			case 'X': return 1000; }
	})();
	if (!multi) return null;
	const val = multi * parseFloat(cls.slice(1));
	return isNaN(val) ? null : val;
}

async function unlinkFlare(flare: RowDict) {
	const { modifySource, data, columns } = useEventsState.getState();
	if (!modifySource || !data.feid_sources || !data.sources_erupt)
		return;
	const eruptId = data.feid_sources.find(row => row[0] === modifySource)?.[eruptIdIdx] as number | null;
	const linkCol = columns.sources_erupt!.find(col =>
		col.id === flaresLinkId[flare.src as keyof typeof flaresLinkId]);
	if (!eruptId || !linkCol)
		return;

	if (!await askProceed(<>
		<h4>Ulink {flare.src as string} flare?</h4>
		<p>Remove {flare.class as any ?? ''} {flare.src as string} flare from eruption #{eruptId}?</p>
	</>))
		return;
	makeChange('sources_erupt', { column: linkCol, value: null, id: eruptId });
}

async function linkFlare(flare: RowDict, feidId: number) {
	const { data, columns, modifySource, setStartAt, setEndAt } = useEventsState.getState();

	if (setStartAt || setEndAt || !data.feid_sources || !data.sources_erupt)
		return;
	const modifyingEruptId = data.feid_sources.find(row => row[0] === modifySource)?.[eruptIdIdx];

	const linkColId = flaresLinkId[flare.src as keyof typeof flaresLinkId];
	const idColId = linkColId.endsWith('start') ? 'start_time' : 'id';
	const linkColIdx = columns.sources_erupt!.findIndex(c => c.id === linkColId);

	const linkedToOther = data.sources_erupt.find(row => linkColId.endsWith('id') ?
		row[linkColIdx] === flare[idColId] : (row[linkColIdx] as any)?.getTime() === (flare.start_time as any)?.getTime());
	
	if (linkedToOther)
		return askProceed(<>
			<h4>Flare already linked</h4>
			<p>Unlink this flare from eruption #{linkedToOther[0]} first!</p>
		</>);

	const actuallyLink = async (eruptId: number, createdSrc?: number) => {
		const row = createdSrc ? [eruptId, ...columns.sources_erupt!.slice(1).map(a => null)] :
			data.sources_erupt!.find(rw => rw[0] === eruptId);
		if (!row)
			return logError('Eruption not found: '+eruptId.toString());
		const erupt = rowAsDict(row as any, columns.sources_erupt!);
		const alreadyLinked = erupt[linkColId];
		if (alreadyLinked) {
			if (!await askProceed(<>
				<h4>Replace {flare.src as string} flare?</h4>
				<p>Flare from {flare.src as string} list is already linked to this eruption, replace?</p>
			</>))
				return;
		}

		erupt[linkColId] = flare[idColId];

		if (erupt.flr_source == null || (alreadyLinked && erupt.flr_source === flare.src)) {
			erupt.flr_source = flare.src;

			erupt.lat = flare.lat;
			erupt.lon = flare.lon;
			erupt.coords_source = 'FLR';

			erupt.flr_start = flare.start_time;
			erupt.flr_peak = flare.peak_time;
			erupt.flr_end = flare.end_time;
			erupt.active_region = flare.active_region;
			erupt.flr_flux = flare.flux ?? parseFlareFlux(flare.class as string);
		}

		makeSourceChanges('sources_erupt', feidId, eruptId, erupt, createdSrc);
		logMessage(`Linked ${flare.src} flare ${flare.class} to FE/ID #${feidId}`);
	};

	if (modifyingEruptId != null)
		return actuallyLink(modifyingEruptId as number);

	askConfirmation(<>
		<h4>Create new entry</h4>
		<p>No source is selected, create a new one linked to current event?</p>
	</>, async () => {
		try {
			const res = await apiPost<{ id: number, source_id: number }>('events/createSource',
				{ entity: 'sources_erupt', id: feidId });
			actuallyLink(res.id, res.source_id);
		} catch (e) {
			logError(e?.toString());
		}
	});
	
}

export function FlaresContextMenu() {
	const detail = useContextMenu(state => state.menu?.detail) as { flare: RowDict } | undefined;
	const { id } = useFeidCursor();
	const flare = detail?.flare;
	const erupt = useSource('sources_erupt');
	const src = flare?.src as keyof typeof flaresLinkId;
	const isLinked = flare && (flaresLinkId[src]!.endsWith('id')
		? flare.id === erupt?.[flaresLinkId[src]]
		: (flare.start_time as any).getTime() === (erupt?.[flaresLinkId[src]] as any)?.getTime());

	return !flare ? null : <>
		<button className='TextButton' style={{ color: color(erupt?.[flaresLinkId[src]] ? 'text-dark' : 'text') }}
			onClick={() => id && linkFlare(flare, id)}>
				Link {src} flare</button>
		{isLinked && <button className='TextButton' onClick={() => unlinkFlare(flare)}>Unlink {src} flare</button>}
	</>;
}

export default function FlaresTable() {
	const { cursor: sCursor, modifySource } = useEventsState();
	const cursor = sCursor?.entity === 'flares' ? sCursor : null;
	const erupt = useSource('sources_erupt');
	const eruptions = useTable('sources_erupt');

	const { id: nodeId, size } = useContext(LayoutContext)!;
	const context = useFlaresTable();
	const { start: cursorTime, id: feidId } = useFeidCursor();
	if (!context)
		return <div className='Center'>LOADING..</div>;
	const { columns, data } = context;

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
	const linked = erupt && Object.fromEntries(Object.entries(flaresLinkId).map(([src, linkId]) => [src, erupt[linkId]]));

	return <TableWithCursor {...{
		entity: 'flares',
		data, columns, size, viewSize, focusIdx, onKeydown: e => {
			if (cursor && erupt && e.key === '-')
				return unlinkFlare(rowAsDict(data[cursor.row] as any, columns));
			if (cursor && ['+', '='].includes(e.key))
				return feidId && linkFlare(rowAsDict(data[cursor.row] as any, columns), feidId);
		},
		thead: <tr>{columns.map((col) =>
			<td key={col.id} title={`[${col.name}] ${col.description ?? ''}`} className='ColumnHeader' style={{ cursor: 'auto' }}>
				<div style={{ height: 20 + headerPadding, lineHeight: 1, fontSize: 15 }}>{col.name}</div>
			</td>)}
		</tr>,
		row: (row, idx, onClick) => {
			const flare = rowAsDict(row as any, columns);
			const stime = (flare.start_time as any)?.getTime();
			const linkColId = flaresLinkId[flare.src as keyof typeof flaresLinkId];
			const isLinked = linkColId?.endsWith('id')
				? flare.id === linked?.[flare.src as any]
				: stime === (linked?.[flare.src as any] as any)?.getTime();
			const isPrime = isLinked && erupt?.flr_source === flare.src;
			const otherLinked = !isLinked && linked?.[flare.src as any];
			const darkk = otherLinked || (!erupt?.flr_start ?
				stime > focusTime! + 864e5    || stime < focusTime! - 3 * 864e5 : 
				stime > focusTime! + 36e5 * 4 || stime < focusTime! - 36e5 * 4);

			// FIXME: this is probably slow
			const eruptLinkIdx = !darkk && eruptions.columns?.findIndex(col => col.id === linkColId);
			const dark = darkk || (eruptLinkIdx && eruptions.data?.find(eru =>
				linkColId?.endsWith('id')
					? flare.id === eru[eruptLinkIdx]
					: stime === (eru[eruptLinkIdx] as any)?.getTime())); 
		
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
								modifySource && feidId && linkFlare(rowAsDict(row as any, columns), feidId);
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