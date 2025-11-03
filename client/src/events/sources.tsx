import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchTable, type ColumnDef } from './columns';
import {
	chIdIdx,
	cmeLinks,
	eruptIdIdx,
	fIdIdx,
	flaresLinks,
	icmeLinks,
	linkSource,
	makeChange,
	makeSourceChanges,
	rowAsDict,
	setRawData,
	useEventsState,
	type TableName,
} from './eventsState';
import { equalValues, type CME, type Flare, type ICME, type SrcEruptRow } from './events';
import { askConfirmation, askProceed } from '../Utility';
import { logError, logMessage } from '../app';
import { create } from 'zustand';

type EruptEnt = 'flare' | 'cme' | 'icme';
type HoleEnt = 'solen' | 'chimera';

export type CHS = {
	id: number;
	tag: string;
	time: Date;
	lat: number;
	width: number;
	area: number;
	b: number;
	phi: number;
	chimera_time: Date;
	chimera_id: number;
};
export type SolenCH = { tag: string; time: Date; location: string | null };
export type ChimeraCH = {
	id: number;
	area_percent: number;
	xcen: number;
	ycen: number;
	lat: number;
	lon: number;
	width: number;
	area: number;
	b: number;
	phi: number;
	chimera_time: Date;
};
type EruptiveEvent = Flare | CME | ICME;

export const columnOrder = {
	flare: ['class', 'lat', 'lon', 'start_time', 'active_region', 'peak_time', 'end_time'],
	cme: ['time', 'speed', 'lat', 'lon', 'angular_width', 'enlil_id', 'note', 'central_angle'],
	icme: ['time'],
	sources_erupt: ['flr_start', 'cme_time', 'lat', 'lon', 'active_region', 'coords_source', 'cme_speed'],
	sources_ch: ['time', 'tag', 'lat', 'b', 'phi', 'area', 'width'],
};
export const sourceLabels = {
	flare: Object.keys(flaresLinks) as (keyof typeof flaresLinks)[],
	cme: Object.keys(cmeLinks) as (keyof typeof cmeLinks)[],
	icme: Object.keys(icmeLinks) as (keyof typeof icmeLinks)[],
};

type CatchedHolesState = null | { start: number; end: number; solenHole: SolenCH | null };
export const useHolesViewState = create<{
	catched: CatchedHolesState;
	time: number;
	setTime: (a: number) => void;
	setCatched: (a: CatchedHolesState) => void;
}>()((set) => ({
	catched: null,
	time: 0,
	setTime: (time) => set((s) => ({ ...s, time })),
	setCatched: (catched) => set((s) => ({ ...s, catched })),
}));

export function getSourceLink<T extends EruptEnt>(which: T, src: any) {
	const links = { flare: flaresLinks, cme: cmeLinks, icme: icmeLinks }[which];
	return (
		(links?.[src as keyof typeof links] as [
			keyof SrcEruptRow,
			(T extends 'icme' ? 'time' : 'id') | (T extends 'flare' ? 'start_time' : 'time')
		]) ?? [null, null]
	);
}

export const timeInMargin = (t: any, of: any, margin: number, right?: number) =>
	of?.getTime() - margin <= t?.getTime() && t?.getTime() <= of?.getTime() + (right ?? margin);

export async function unlinkEruptiveSourceEvent(which: EruptEnt, event: EruptiveEvent) {
	const { modifySource, data, columns } = useEventsState.getState();
	if (!modifySource || !data.feid_sources || !data.sources_erupt) return logMessage('Source not selected');
	const eruptId = data.feid_sources.find((row) => row[0] === modifySource)?.[eruptIdIdx] as number | null;
	const row = data.sources_erupt!.find((rw) => rw[0] === eruptId);
	const erupt = rowAsDict(row, columns.sources_erupt!) as SrcEruptRow;

	const linkColId = getSourceLink(which, event.src)[0];
	if (eruptId == null) return logError('Source not found');

	if (
		!(await askProceed(
			<>
				<h4>
					Ulink {event.src} {which}?
				</h4>
				<p>
					Remove {which} from eruption #{eruptId}?
				</p>
			</>
		))
	)
		return;

	makeChange('sources_erupt', { column: linkColId, value: null, id: eruptId });
	if (which === 'flare' && erupt.flr_source === event.src)
		makeChange('sources_erupt', { column: 'flr_source', value: null, id: eruptId });
	if (which === 'cme' && erupt.cme_source === event.src) makeChange('sources_erupt', { column: 'cme_source', value: null, id: eruptId });
}

export function linkEruptiveSourceEvent(which: EruptEnt, event: EruptiveEvent, feidId: number) {
	const { data, columns, modifySource, setStartAt, setEndAt } = useEventsState.getState();

	if (setStartAt || setEndAt || !data.feid_sources || !data.sources_erupt) return;
	const modifyingEruptId = data.feid_sources.find((row) => row[0] === modifySource)?.[eruptIdIdx];

	const [linkColId, idColId] = getSourceLink(which, event.src);
	const linkColIdx = columns.sources_erupt!.findIndex((c) => c.id === linkColId);

	const linkedToOther = which !== 'icme' && data.sources_erupt.find((row) => equalValues(row[linkColIdx], (event as any)[idColId]));

	if (linkedToOther)
		return askProceed(
			<>
				<h4>{which} already linked</h4>
				<p>
					Unlink this {which} from eruption #{linkedToOther[0]} first!
				</p>
			</>
		);

	const actuallyLink = async (eruptId: number) => {
		const { data: newData } = useEventsState.getState();
		const row = newData.sources_erupt!.find((rw) => rw[0] === eruptId);
		if (!row) return logError('Eruption not found: ' + eruptId.toString());
		const erupt = rowAsDict(row, columns.sources_erupt!) as SrcEruptRow;
		const alreadyLinked = erupt[linkColId];
		if (alreadyLinked) {
			if (
				!(await askProceed(
					<>
						<h4>
							Replace {event.src} {which}?
						</h4>
						<p>
							{which} from {event.src} list is already linked to this eruption, replace?
						</p>
					</>
				))
			)
				return;
		}

		(erupt as any)[linkColId] = (event as any)[idColId];

		if (which === 'flare') {
			if (erupt.flr_source == null || (alreadyLinked && erupt.flr_source === event.src)) assignFlareToErupt(erupt, event as Flare);
			else erupt.active_region = erupt.active_region ?? (event as Flare).active_region ?? null;
		}
		if (which === 'cme') {
			if (erupt.cme_source == null || (alreadyLinked && erupt.cme_source === event.src)) assignCMEToErupt(erupt, event as CME);
		}

		makeSourceChanges('sources_erupt', erupt);
		logMessage(`Linked ${event.src} ${which} to FE/ID #${feidId}`);
	};

	if (modifyingEruptId != null) return actuallyLink(modifyingEruptId as number);

	askConfirmation(
		<>
			<h4>Create new entry</h4>
			<p>No source is selected, create a new one linked to current event?</p>
		</>,
		() => {
			const srcId = linkSource('sources_erupt', feidId);
			actuallyLink(srcId);
		}
	);
}

export function inputEruptionManually(
	{ lat, lon, time }: { lat: number; lon: number; time: Date },
	feidId: number,
	modifyingEruptId: number | null
) {
	const makeChanges = (eruptId: number) =>
		makeChange(
			'sources_erupt',
			[
				['lat', lat],
				['lon', lon],
				['cme_time', time],
				['coords_source', 'MNL'],
			].map(
				([column, val]) =>
					({
						id: eruptId,
						column,
						value: val,
					} as any)
			)
		);

	if (modifyingEruptId != null) return makeChanges(modifyingEruptId);

	askConfirmation(
		<>
			<h4>Create new eruption</h4>
			<p>No eruption is selected, create a new one with specified coordinates?</p>
		</>,
		() => {
			const srcId = linkSource('sources_erupt', feidId);
			makeChanges(srcId);
		}
	);
}

export async function unlinkHoleSourceEvent(which: HoleEnt) {
	const { modifySource, data } = useEventsState.getState();
	if (!modifySource || !data.feid_sources || !data.sources_ch) return logMessage('Source not selected');
	const chId = data.feid_sources.find((row) => row[0] === modifySource)?.[chIdIdx] as number | null;
	if (!chId) return logError('Source not found');

	if (
		!(await askProceed(
			<>
				<h4>Ulink {which} CH?</h4>
				<p>
					Remove {which} CH info from CHS #{chId}?
				</p>
			</>
		))
	)
		return;

	const resetCols = which === 'solen' ? ['tag'] : ['chimera_id', 'chimera_time'];
	for (const column of resetCols) makeChange('sources_ch', { column, value: null, id: chId });
}

export function linkHoleSourceEvent(which: HoleEnt, event: SolenCH | ChimeraCH, feidId: number) {
	const { data, columns, modifySource, setStartAt, setEndAt } = useEventsState.getState();

	if (setStartAt || setEndAt || !data.feid_sources || !data.sources_ch) return;
	const modifyingChId = data.feid_sources.find((row) => row[0] === modifySource)?.[chIdIdx];

	const linkedToOther = which === 'solen' && data.sources_ch.find((row) => equalValues(row[2], (event as SolenCH).tag));

	if (linkedToOther)
		return askProceed(
			<>
				<h4>{which} CH already linked</h4>
				<p>
					Unlink this {which} from CHS #{linkedToOther[0]} first!
				</p>
			</>
		);

	const actuallyLink = async (chId: number) => {
		const { data: newData } = useEventsState.getState();
		const row = newData.sources_ch!.find((rw) => rw[0] === chId);
		if (!row) return logError('CHS not found: ' + chId.toString());
		const chs = rowAsDict(row as any, columns.sources_ch!) as CHS;
		const alreadyLinked = which === 'solen' ? chs.tag : chs.chimera_time;
		if (alreadyLinked) {
			if (
				!(await askProceed(
					<>
						<h4>Replace {which} CH?</h4>
						<p>{which} CH seems to be linked to this event already, replace?</p>
					</>
				))
			)
				return;
		}

		if (which === 'solen') {
			const tch = event as SolenCH;
			chs.tag = tch.tag;
			if (!chs.chimera_time || !chs.time) chs.time = tch.time;
		} else if (which === 'chimera') {
			const tch = event as ChimeraCH;
			chs.chimera_id = tch.id;
			chs.chimera_time = tch.chimera_time;

			const chtm = tch.chimera_time.getTime() / 1e3;
			const sunRotation = 360 / 27.27 / 86400; // deg/s, kinda
			const rotateToCenter = -tch.lon / sunRotation;
			chs.time = new Date(Math.round(chtm + rotateToCenter) * 1e3);
			chs.b = tch.b;
			chs.lat = tch.lat;
			chs.phi = tch.phi;
			chs.area = tch.area_percent;
			chs.width = tch.width;
		}

		makeSourceChanges('sources_ch', chs);
		logMessage(`Linked ${which} CH to FEID #${feidId}`);
	};

	if (modifyingChId != null) return actuallyLink(modifyingChId as number);

	askConfirmation(
		<>
			<h4>Create new entry</h4>
			<p>No source is selected, create a new one linked to current event?</p>
		</>,
		() => {
			const srcId = linkSource('sources_ch', feidId);
			actuallyLink(srcId);
		}
	);
}

export async function linkSrcToEvent(entity: 'sources_ch' | 'sources_erupt', srcId: number, feidId: number) {
	const isCh = entity === 'sources_ch';
	const { data, setStartAt, setEndAt } = useEventsState.getState();

	if (setStartAt || setEndAt || !data.feid_sources || !data.sources_ch) return;

	const isLinked = data.feid_sources.find((row) => row[fIdIdx] === feidId && row[isCh ? chIdIdx : eruptIdIdx] === srcId);
	if (isLinked)
		return askProceed(
			<>
				<h4>Already linked</h4>
				<p>This {isCh ? 'CHS' : 'Erupt'} is already linked to this FEID event.</p>
			</>
		);

	try {
		linkSource(entity, feidId, srcId);
		logMessage(`Linked ${isCh ? 'CHS' : 'Erupt'} #${srcId} to FE/ID #${feidId}`);
	} catch (e) {
		logError(e?.toString());
	}
}

export function assignCMEToErupt(erupt: SrcEruptRow, cme: CME) {
	erupt.cme_source = cme.src;
	erupt.cme_time = cme.time;
	erupt.cme_speed = cme.speed;

	if (erupt.coords_source == null || erupt.coords_source === cme.src) {
		erupt.lat = cme.lat;
		erupt.lon = cme.lon;
		if (cme.lon != null && cme.lat != null) erupt.coords_source = cme.src;
	}
}

export function assignFlareToErupt(erupt: SrcEruptRow, flare: Flare) {
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

export function serializeCoords({ lat, lon }: { lat: number | null; lon: number | null }) {
	return (lat != null ? (lat > 0 ? 'N' : 'S') + Math.abs(lat) : '') + (lon != null ? (lon > 0 ? 'W' : 'E') + Math.abs(lon) : '');
}

export function parseFlareFlux(cls: string | null) {
	if (!cls) return null;
	const multi = (() => {
		switch (cls.at(0)) {
			case 'A':
				return 0.1;
			case 'B':
				return 1;
			case 'C':
				return 10;
			case 'M':
				return 100;
			case 'X':
				return 1000;
		}
	})();
	if (!multi) return null;
	const val = multi * parseFloat(cls.slice(1));
	return isNaN(val) ? null : Math.round(val * 10) / 10;
}

export function useSolenHolesQuery() {
	return useQuery({
		queryKey: ['solen_holes'],
		queryFn: async () => {
			const res = await fetchTable('solen_holes');
			for (const col of res.columns) {
				col.width =
					{
						tag: 5.5,
						polarity: 2,
						loc: 8.5,
						time: 6,
						comment: 11,
					}[col.name] ?? col.width;
			}
			return res;
		},
	});
}

export function useCompoundTable(which: EruptEnt) {
	return (
		useQuery({
			queryKey: ['events:' + which],
			staleTime: Infinity,
			placeholderData: keepPreviousData,
			queryFn: async () => {
				console.log('useCompoundTable', which);
				const tables = {
					cme: ['lasco_cmes', 'donki_cmes', 'cactus_cmes'],
					icme: ['r_c_icmes'],
					flare: ['solarsoft_flares', 'donki_flares', 'solardemon_flares'],
				}[which];
				const results = await Promise.all(tables.map((t) => fetchTable(t)));
				const sCols = results.map((q) => q.columns);
				const sData = results.map((q) => q.data);
				const pairs = Object.values(sCols).flatMap((cols) => cols.map((c) => [c.id, c]));
				const columns = [...new Map([...(columnOrder[which].map((cn) => [cn, null]) as any), ...pairs]).values()] as ColumnDef[];
				const indexes = sourceLabels[which].map((src, srci) => columns.map((c) => sCols[srci].findIndex((sc) => sc.id === c?.id)));
				console.log(222);
				const data = sData.flatMap((rows, srci) =>
					rows.map((row) => [sourceLabels[which][srci], ...indexes[srci].map((idx) => (idx < 0 ? null : row[idx]))])
				);
				console.log(333);
				const tIdx = columns.findIndex((c) => c.id === (which === 'flare' ? 'start_time' : 'time')) + 1;
				data.sort((a, b) => (a[tIdx] as Date)?.getTime() - (b[tIdx] as Date)?.getTime());

				console.log(444);
				for (const col of columns) {
					if (col.name.includes('class')) col.width = 5.5;
					if (['lat', 'lon'].includes(col.name)) col.width = 4.5;
					if (which === 'flare' && ['end', 'peak'].includes(col.name)) col.width = 6;
					if (['type', 'level'].includes(col.name)) col.width = 3;
				}
				console.log(tables, data);

				return { data, columns: [{ id: 'src', name: 'src', description: '', fullName: 'src', width: 4 } as ColumnDef, ...columns] };
			},
		}).data ?? { data: [], columns: [] }
	);
}

export function useTableQuery(tbl: TableName) {
	const data = useEventsState((st) => st.data[tbl]);

	const query = useQuery({
		queryKey: ['tableData', tbl],
		staleTime: Infinity,
		queryFn: async () => {
			const { columns, data: dt } = await fetchTable(tbl);
			const order = columnOrder[tbl as keyof typeof columnOrder];
			if (!order) {
				setRawData(tbl, dt as any, columns);
				return dt;
			}
			const cols = [...new Set(['id', ...order, ...columns.map((c) => c.id)])];

			for (const col of columns) {
				if (tbl === 'sources_ch') {
					col.width = 'tag' === col.id ? 7.5 : ['b', 'phi', 'lat', 'area', 'width'].includes(col.id) ? 4.5 : col.width;
				} else if (tbl === 'sources_erupt') {
					col.width = ['XF peak', 'XF end'].includes(col.name) ? 6 : ['lat', 'lon'].includes(col.name) ? 4.5 : col.width;
				}
			}

			const idxs = cols.map((cid) => columns.findIndex((c) => c.id === cid));
			const dat = dt.map((row) => idxs.map((i) => row[i]));
			const cl = idxs.map((i) => columns[i]);
			setRawData(tbl, dat as any, cl);
			return dat;
		},
	});

	if (!data && query.isFetched) query.refetch();

	return query;
}
