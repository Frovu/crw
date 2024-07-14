import { useQuery } from 'react-query';
import { fetchTable, type ColumnDef } from './columns';
import { cmeLinks, eruptIdIdx, flaresLinks, icmeLinks, makeChange, makeSourceChanges, rowAsDict, setRawData, useEventsState, type RowDict, type TableName } from './eventsState';
import { equalValues } from './events';
import { askConfirmation, askProceed } from '../Utility';
import { logError, logMessage } from '../app';
import { apiPost } from '../util';
import { create } from 'zustand';

type EruptEnt = 'flare' | 'cme' | 'icme';

export const columnOrder = {
	flare: ['class', 'lat', 'lon', 'start_time', 'active_region', 'peak_time', 'end_time'],
	cme: ['time', 'speed', 'lat', 'lon', 'central_angle', 'angular_width', 'note'],
	icme: ['time'],
	sources_erupt: ['flr_start', 'cme_time', 'lat', 'lon', 'active_region', 'coords_source', 'cme_speed'],
};
export const sourceLabels = {
	flare: Object.keys(flaresLinks) as (keyof typeof flaresLinks)[],
	cme: Object.keys(cmeLinks) as (keyof typeof cmeLinks)[],
	icme: Object.keys(icmeLinks) as (keyof typeof icmeLinks)[]
};

export const useHolesViewState = create<{
	time: number,
	setTime: (a: number) => void
}>()(set => ({
	time: 0,
	setTime: time => set(s => ({ ...s, time }))
}));

export function getSourceLink(which: EruptEnt, src: any) {
	const links = { flare: flaresLinks, cme: cmeLinks, icme: icmeLinks }[which];
	return links?.[src as keyof typeof links] as [string, string] ?? [null, null];
}

export const timeInMargin = (t: any, of: any, margin: number, right?: number) =>
	of?.getTime() - margin <= t?.getTime() && t?.getTime() <= of?.getTime() + (right ?? margin);

export async function unlinkEruptiveSourceEvent(which: EruptEnt, event: RowDict) {
	const { modifySource, data, columns } = useEventsState.getState();
	if (!modifySource || !data.feid_sources || !data.sources_erupt)
		return logMessage('Source not selected');
	const eruptId = data.feid_sources.find(row => row[0] === modifySource)?.[eruptIdIdx] as number | null;
	const linkColId = getSourceLink(which, event.src)[0];
	const linkCol = columns.sources_erupt!.find(col => col.id === linkColId);
	if (!eruptId || !linkCol)
		return logError('Source not found');

	if (!await askProceed(<>
		<h4>Ulink {event.src as string} {which}?</h4>
		<p>Remove {which} from eruption #{eruptId}?</p>
	</>))
		return;
	makeChange('sources_erupt', { column: linkCol, value: null, id: eruptId });
}

export function linkEruptiveSourceEvent(which: EruptEnt, event: RowDict, feidId: number) {
	const { data, columns, modifySource, setStartAt, setEndAt } = useEventsState.getState();

	if (setStartAt || setEndAt || !data.feid_sources || !data.sources_erupt)
		return;
	const modifyingEruptId = data.feid_sources.find(row => row[0] === modifySource)?.[eruptIdIdx];

	const [linkColId, idColId] = getSourceLink(which, event.src);
	const linkColIdx = columns.sources_erupt!.findIndex(c => c.id === linkColId);

	const linkedToOther = which !== 'icme' &&
		data.sources_erupt.find(row => equalValues(row[linkColIdx], event[idColId]));
	
	if (linkedToOther)
		return askProceed(<>
			<h4>{which} already linked</h4>
			<p>Unlink this {which} from eruption #{linkedToOther[0]} first!</p>
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
				<h4>Replace {event.src as string} {which}?</h4>
				<p>{which} from {event.src as string} list is already linked to this eruption, replace?</p>
			</>))
				return;
		}

		erupt[linkColId] = event[idColId];

		if (which === 'flare') {
			if (erupt.flr_source == null || (alreadyLinked && erupt.flr_source === event.src))
				assignFlareToErupt(erupt, event);
			else
				erupt.active_region = erupt.active_region ?? event.active_region;

		}
		if (which === 'cme') {
			if (erupt.cme_source == null || (alreadyLinked && erupt.cme_source === event.src))
				assignCMEToErupt(erupt, event);
		}

		makeSourceChanges('sources_erupt', erupt, feidId, createdSrc);
		logMessage(`Linked ${event.src} ${which} to FE/ID #${feidId}`);
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

export function assignCMEToErupt(erupt: RowDict, cme: RowDict) {
	erupt.cme_source = cme.src;
	erupt.cme_time = cme.time;
	erupt.cme_speed = cme.speed;

	if (erupt.coords_source == null || erupt.coords_source === cme.src) {
		erupt.lat = cme.lat;
		erupt.lon = cme.lon;
		erupt.coords_source = cme.src;
	}
}

export function assignFlareToErupt(erupt: RowDict, flare: RowDict) {
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

export function serializeCoords({ lat, lon }: { lat: number | null, lon: number | null }) {
	return (lat != null ? (lat > 0 ? 'N' : 'S') + Math.abs(lat) : '')
		 + (lon != null ? (lon > 0 ? 'W' : 'E') + Math.abs(lon) : '');
}

export function parseFlareFlux(cls: string | null) {
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
	return isNaN(val) ? null : Math.round(val * 10) / 10;
}

export function useSolenHolesQuery() {
	return useQuery(['solen_holes'], async () => {
		const res = await fetchTable('solen_holes');
		for (const col of res.columns) {
			col.width = {
				tag: 5.5,
				polarity: 2,
				loc: 8.5,
				time: 6,
				comment: 11
			}[col.name] ?? col.width;
		}
		return res;
	});
}

export function useCompoundTable(which: EruptEnt) {
	return useQuery({
		queryKey: ['erupts:' + which],
		staleTime: Infinity,
		keepPreviousData: true,
		queryFn: async () => {
			const tables = {
				cme: ['lasco_cmes', 'donki_cmes'],
				icme: ['r_c_icmes'],
				flare: ['solarsoft_flares', 'donki_flares', 'solardemon_flares']
			}[which];
			const results = await Promise.all(tables.map(t => fetchTable(t)));
			const sCols = results.map(q => q.columns);
			const sData = results.map(q => q.data);
			const pairs = Object.values(sCols).flatMap(cols => cols.map(c => [c.id, c]));
			const columns = [...new Map([...columnOrder[which]
				.map(cn => [cn, null]) as any, ...pairs]).values()] as ColumnDef[];
			const indexes = sourceLabels[which].map((src, srci) =>
				columns.map(c => sCols[srci].findIndex(sc => sc.id === c?.id)));
			const data = sData.flatMap((rows, srci) => rows.map(row =>
				[sourceLabels[which][srci], ...indexes[srci].map(idx => idx < 0 ? null : row[idx])]));
			const tIdx = columns.findIndex(c => c.id === (which === 'flare' ? 'start_time' : 'time')) + 1;
			data.sort((a, b) => (a[tIdx] as Date)?.getTime() - (b[tIdx] as Date)?.getTime());
	
			for (const col of columns) {
				if (col.name.includes('class'))
					col.width = 5.5;
				if (['lat', 'lon'].includes(col.name))
					col.width = 4.5;
				if (which === 'flare' && ['end', 'peak'].includes(col.name))
					col.width = 6;
				if (['type', 'level'].includes(col.name))
					col.width = 3;
			}
	
			return { data, columns: [
				{ id: 'src', name: 'src', description: '', fullName: 'src', width: 4 } as ColumnDef,
				...columns
			] };

		}
	}).data ?? { data: [], columns: [] };

}

export function useTableQuery(tbl: TableName) {
	const data = useEventsState(st => st.data[tbl]);

	const query = useQuery({
		queryKey: [tbl],
		staleTime: Infinity,
		queryFn: async () => {
			const { columns, data: dt } = await fetchTable(tbl);
			const order = columnOrder[tbl as keyof typeof columnOrder];
			if (!order) {
				setRawData(tbl, dt as any, columns);
				return dt;
			}
			const cols = [...new Set(['id', ...order, ...columns.map(c => c.id)])];
			const idxs = cols.map(cid => columns.findIndex(c => c.id === cid));
			const dat = dt.map(row => idxs.map(i => row[i]));
			const col = idxs.map(i => columns[i]);
			setRawData(tbl, dat as any, col);
			return dat;
		}
	});

	if (!data && query.isFetched)
		query.refetch();

	return query;
}