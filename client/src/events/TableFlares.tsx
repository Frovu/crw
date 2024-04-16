import { useContext } from 'react';
import { LayoutContext } from '../layout';
import { TableWithCursor } from './TableView';
import { valueToString } from './events';
import { color, logError } from '../app';
import { rowAsDict, useCursor, useEventsState, type RowDict } from './eventsState';
import { useFlaresTable } from './sources';
import { apiPost } from '../util';
import { askConfirmation, askProceed } from '../Utility';
import type { ColumnDef, DataRow } from './columns';

export const flaresLinkId = {
	SFT: 'solarsoft_flr_start',
	NOA: 'noaa_flare_start',
	DKI: 'donki_flr_id',
	dMN: 'solardemon_flr_id'
} as const;

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

async function linkFlare(flare: RowDict) {
	const { data, columns, modifySource, modifyId, setStartAt, setEndAt } = useEventsState.getState();
	if (setStartAt || setEndAt || modifyId == null
		|| !data.feid_sources || !data.sources_erupt)
		return;
	const [fIdIdx, eruptIdIdx] = ['feid_id', 'erupt_id'].map(w =>
		columns.feid_sources!.findIndex(c => c.id === w));
	const modifyingEruptId = data.feid_sources.find(row =>
		row[fIdIdx] === modifyId && row[0] === modifySource)?.[eruptIdIdx];

	const actuallyLink = async (eruptId: number, createdSrc?: number) => {
		const row = createdSrc ? [eruptId, ...columns.sources_erupt!.slice(1).map(a => null)] :
			data.sources_erupt!.find(rw => rw[0] === eruptId);
		if (!row)
			return logError('Eruption not found: '+eruptId.toString());
		const erupt = rowAsDict(row as any, columns.sources_erupt!);

		const linkColId = flaresLinkId[flare.src as keyof typeof flaresLinkId];
		const idColId = linkColId.endsWith('start') ? 'start_time' : 'id';

		const alreadyLinked = erupt[linkColId];
		if (alreadyLinked && alreadyLinked !== flare[idColId]) {
			if (!await askProceed(<>
				<h4>Replace {flare.src as string} flare?</h4>
				<p>Other flare from {flare.src as string} list is linked to this eruption, replace?</p>
			</>))
				return;
		}

		erupt[linkColId] = flare[idColId];

		if (erupt.flr_source == null || alreadyLinked) {
			erupt.flr_source = flare.src;

			if (erupt.coords_source == null) {
				erupt.lat = flare.lat;
				erupt.lon = flare.lon;
			}

			erupt.flr_start = flare.start_time;
			erupt.flr_peak = flare.peak_time;
			erupt.flr_end = flare.end_time;
			erupt.active_region = flare.active_region;
			erupt.flr_flux = flare.flux ?? parseFlareFlux(flare.class as string);
		}
	};

	if (modifyingEruptId != null)
		return actuallyLink(modifyingEruptId as number);

	askConfirmation(<>
		<h4>Create new entry</h4>
		<p>No source is selected, create a new one linked to current event?</p>
	</>, async () => {
		try {
			const res = await apiPost<{ id: number, source_id: number }>('events/create', { entity: 'sources_erupt' });
			actuallyLink(res.id, res.source_id);
		} catch (e) {
			logError(e?.toString());
		}
	});
	
}

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