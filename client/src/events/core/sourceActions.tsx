import { askConfirmation, withConfirmation } from '../../Utility';
import { logError, logMessage } from '../../app';
import { create } from 'zustand';
import { getTable, linkSource, makeChange, makeSourceChanges } from './editableTables';
import { sourceLabels, sourceLinks, type Tables } from '../../api';
import { compoundTables } from './query';
import { equalValues } from './eventsSettings';
import { useEventsState } from './eventsState';

type FlareSrc = 'donki_flares' | 'solarsoft_flares' | 'legacy_noaa_flares';
type CMESrc = 'lasco_cmes' | 'donki_cmes' | 'cactus_cmes';
type ICMESrc = 'r_c_icmes';
type EruptSrc = { flare: FlareSrc; cme: CMESrc; icme: ICMESrc };
type EruptEnt = keyof EruptSrc;

type CHEnt = 'solen_holes' | 'chimera_holes';
type EruptSrcLabel<T extends EruptEnt> = (typeof sourceLabels)[EruptSrc[T]];

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
type EruptiveEvent<T extends EruptEnt> = { src: EruptSrcLabel<T> } & Tables[EruptSrc[T]] &
	Partial<UnionToIntersection<Tables[EruptSrc[T]]>>;

type CachimeraedHolesState = null | { start: number; end: number; solenHole: Tables['solen_holes'] | null };

export const useHolesViewState = create<{
	cachimeraed: CachimeraedHolesState;
	time: number;
	setTime: (a: number) => void;
	setCachimeraed: (a: CachimeraedHolesState) => void;
}>()((set) => ({
	cachimeraed: null,
	time: 0,
	setTime: (time) => set((s) => ({ ...s, time })),
	setCachimeraed: (cachimeraed) => set((s) => ({ ...s, cachimeraed })),
}));

export function getSourceLink<T extends EruptEnt>(ent: T, src: EruptSrcLabel<T>) {
	const [link, id] = sourceLinks[compoundTables[ent].find((tbl) => sourceLabels[tbl] === src)!];
	return { link, id };
}

export function unlinkEruptiveSourceEvent<T extends EruptEnt>(ent: T, event: EruptiveEvent<T>) {
	const { modifySourceId } = useEventsState.getState();
	const erupts = getTable('sources_erupt');
	const source = getTable('feid_sources').getById(modifySourceId);
	const eruptId = source?.erupt_id ?? null;
	const erupt = erupts.getById(eruptId);

	if (!erupt) return logError('Eruption not selected');

	withConfirmation(`Ulink ${event.src} ${ent}?`, `Remove ${ent} from eruption #{eruptId}?`, () => {
		const link = getSourceLink(ent, event.src);

		makeChange('sources_erupt', { column: link.link, value: null, id: erupt.id });
		if (ent === 'flare' && erupt.flr_source === event.src)
			makeChange('sources_erupt', { column: 'flr_source', value: null, id: erupt.id });
		if (ent === 'cme' && erupt.cme_source === event.src)
			makeChange('sources_erupt', { column: 'cme_source', value: null, id: erupt.id });
	});
}

export function unlinkHoleSourceEvent(ent: CHEnt) {
	const { modifySourceId } = useEventsState.getState();
	const source = getTable('feid_sources').getById(modifySourceId);
	const chId = source?.ch_id ?? null;

	if (chId == null) return logError('CH not selected');

	withConfirmation(`Ulink ${ent} CH?`, `Remove ${ent} CH info from CHS #${chId}?`, () => {
		const resetCols = ent === 'solen_holes' ? ['tag'] : ['chimera_id', 'chimera_time'];
		for (const column of resetCols) makeChange('sources_ch', { column, value: null, id: chId });
	});
}

export function linkEruptiveSourceEvent<T extends EruptEnt>(ent: T, event: EruptiveEvent<T>, feidId: number) {
	const { modifySourceId, setStartAt, setEndAt } = useEventsState.getState();

	if (setStartAt || setEndAt) return;

	const erupts = getTable('sources_erupt');
	const modifyingEruptId = getTable('feid_sources').getById(modifySourceId)?.erupt_id;

	const link = getSourceLink(ent, event.src);
	const linkColIdx = erupts.index[link.link];
	const eventId = event[link.id as keyof typeof event];

	const linkedToOther = ent !== 'icme' && erupts.data.find((row) => equalValues(row[linkColIdx], eventId));

	if (linkedToOther)
		return askConfirmation(`${ent} already linked`, `Unlink this ${ent} from eruption #{linkedToOther[0]} first!`);

	const actuallyLink = async (eruptId: number) => {
		const erupt = getTable('sources_erupt').getById(eruptId);
		if (!erupt) return logError('Eruption not found: ' + eruptId.toString());

		const alreadyLinked = erupt[link.link];

		const confirmed =
			!alreadyLinked ||
			(await askConfirmation(
				`Replace ${event.src} ${ent}?`,
				`${ent} from ${event.src} list is already linked to this eruption, replace?`
			));
		if (!confirmed) return;

		erupt[link.link] = eventId as any;

		if (ent === 'flare') {
			if (erupt.flr_source == null || (alreadyLinked && erupt.flr_source === event.src)) {
				assignFlareToErupt(erupt, event as EruptiveEvent<'flare'>);
			} else {
				erupt.active_region = erupt.active_region ?? (event as EruptiveEvent<'flare'>).active_region ?? null;
			}
		}
		if (ent === 'cme') {
			if (erupt.cme_source == null || (alreadyLinked && erupt.cme_source === event.src)) {
				assignCMEToErupt(erupt, event as EruptiveEvent<'cme'>);
			}
		}

		makeSourceChanges('sources_erupt', erupt);
		logMessage(`Linked ${event.src} ${ent} to FE/ID #${feidId}`);
	};

	if (modifyingEruptId != null) return actuallyLink(modifyingEruptId as number);

	withConfirmation('Create new entry', 'No source is selected, create a new one linked to current event?', () => {
		const newId = linkSource('sources_erupt', feidId);
		actuallyLink(newId);
	});
}
export function linkHoleSourceEvent<T extends CHEnt>(ent: T, event: Tables[T], feidId: number) {
	const { modifySourceId, setStartAt, setEndAt } = useEventsState.getState();

	if (setStartAt || setEndAt) return;
	const modifyingChId = getTable('feid_sources').getById(modifySourceId)?.ch_id;
	const chs = getTable('sources_ch');

	const linkedToOther =
		ent === 'solen_holes' && chs.data.find((row) => equalValues(row[chs.index.tag], (event as Tables['solen_holes']).tag));

	if (linkedToOther)
		return askConfirmation(`${ent} CH already linked`, `Unlink this ${ent} from CHS #${linkedToOther[0]} first!`);

	const actuallyLink = async (chId: number) => {
		const ch = getTable('sources_ch').getById(chId);
		if (!ch) return logError('CH not found: ' + chId.toString());

		const alreadyLinked = ent === 'solen_holes' ? ch.tag : ch.chimera_time;

		const confirmed =
			!alreadyLinked ||
			(await askConfirmation(`Replace ${ent} CH??`, `${ent} CH seems to be linked to this event already, replace?`));
		if (!confirmed) return;

		if (ent === 'solen_holes') {
			const solen = event as Tables['solen_holes'];
			ch.tag = solen.tag;
			if (!ch.chimera_time || !ch.time) ch.time = solen.time;
		} else {
			const chimera = event as Tables['chimera_holes'];
			ch.chimera_id = chimera.id;
			ch.chimera_time = (chimera as any).chimera_time; // FIXME: provide chimera_time from server?

			const chtm = ch.chimera_time!.getTime() / 1e3;
			const sunRotation = 360 / 27.27 / 86400; // deg/s, kinda
			const rotateToCenter = -chimera.lon! / sunRotation;
			ch.time = new Date(Math.round(chtm + rotateToCenter) * 1e3);
			ch.b = chimera.b;
			ch.lat = chimera.lat;
			ch.phi = chimera.phi;
			ch.area = chimera.area_percent;
			ch.width = chimera.width;
		}

		makeSourceChanges('sources_ch', ch);
		logMessage(`Linked ${ent} CH to FEID #${feidId}`);
	};

	if (modifyingChId != null) return actuallyLink(modifyingChId as number);

	withConfirmation('Create new entry', 'No source is selected, create a new one linked to current event?', () => {
		const srcId = linkSource('sources_ch', feidId);
		actuallyLink(srcId);
	});
}

export function inputEruptionManually(
	{ lat, lon, time }: { lat: number; lon: number; time: Date },
	feidId: number,
	modifyingEruptId: number | null
) {
	const makeChanges = (eruptId: number) => {
		const data = [
			['lat', lat],
			['lon', lon],
			['cme_time', time],
			['coords_source', 'MNL'],
		] as const;

		makeChange(
			'sources_erupt',
			data.map(([column, value]) => ({
				id: eruptId,
				column,
				value,
			}))
		);
	};
	if (modifyingEruptId != null) return makeChanges(modifyingEruptId);

	withConfirmation('Create new eruption', 'No eruption is selected, create a new one with specified coordinates?', () => {
		const srcId = linkSource('sources_erupt', feidId);
		makeChanges(srcId);
	});
}

export async function linkSrcToEvent(entity: 'sources_ch' | 'sources_erupt', srcId: number, feidId: number) {
	const isCh = entity === 'sources_ch';
	const { setStartAt, setEndAt } = useEventsState.getState();

	if (setStartAt || setEndAt) return;

	const src = getTable('feid_sources');
	const idIdx = src.index[isCh ? 'ch_id' : 'erupt_id'];

	const isLinked = src.data.find((row) => row[src.index.feid_id] === feidId && row[idIdx] === srcId);
	if (isLinked)
		return askConfirmation('Already linked', `This ${isCh ? 'CHS' : 'Erupt'} is already linked to this FEID event.`);

	try {
		linkSource(entity, feidId, srcId);
		logMessage(`Linked ${isCh ? 'CHS' : 'Erupt'} #${srcId} to FE/ID #${feidId}`);
	} catch (e) {
		logError(e?.toString());
	}
}

export function assignCMEToErupt(erupt: Tables['sources_erupt'], cme: EruptiveEvent<'cme'>) {
	erupt.cme_source = cme.src;
	erupt.cme_time = cme.time;
	erupt.cme_speed = cme.speed;
	if (erupt.coords_source == null || erupt.coords_source === cme.src) {
		if (cme.src === 'CCT') return;
		erupt.lat = cme.lat ?? null;
		erupt.lon = cme.lon ?? null;
		if (cme.lon != null && cme.lat != null) erupt.coords_source = cme.src;
	}
}

export function assignFlareToErupt(erupt: Tables['sources_erupt'], flare: EruptiveEvent<'flare'>) {
	erupt.flr_source = flare.src;

	erupt.lat = flare.lat;
	erupt.lon = flare.lon;
	erupt.coords_source = 'FLR';

	erupt.flr_start = flare.start_time;
	erupt.flr_peak = flare.peak_time;
	erupt.flr_end = flare.end_time;
	erupt.active_region = flare.active_region;
	erupt.flr_flux = parseFlareFlux(flare.class);
}

export function serializeCoords({ lat, lon }: { lat: number | null; lon: number | null }) {
	return (
		(lat != null ? (lat > 0 ? 'N' : 'S') + Math.abs(lat) : '') + (lon != null ? (lon > 0 ? 'W' : 'E') + Math.abs(lon) : '')
	);
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
