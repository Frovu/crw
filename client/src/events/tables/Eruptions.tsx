import { useMemo } from 'react';
import { EventsTable, type TableColumn } from './Table';
import { equalValues, valueToString } from '../core/util';
import { logMessage, useEventsContextMenu } from '../../app/app';
import { useFeidCursor, useSelectedSource, useCurrentFeidSources } from '../core/eventsState';
import {
	assignCMEToErupt,
	assignFlareToErupt,
	compoundTables,
	getSourceLink,
	inputEruptionManually,
	linkSrcToEvent,
	parseFlareFlux,
	type EruptiveEvent,
	type EruptSrcLabel,
} from '../core/sourceActions';
import { binarySearch, prettyDate, useEventListener } from '../../util';
import { deleteEvent, makeSourceChanges, useTable, type TableValue } from '../core/editableTables';
import { sourceLabels, sourceLinks, type Tables } from '../../api';
import { useCompoundTable } from '../core/query';
import { Button } from '../../components/Button';
import { SimpleSelect } from '../../components/Select';

const ENT = 'sources_erupt';

const flrSourcedColumns = {
	flr_start: 'start_time',
	flr_peak: 'peak_time',
	flr_end: 'end_time',
	flr_flux: 'class',
	active_region: 'active_region',
} as const;

const cmeSourcedColumns = {
	cme_time: 'time',
	cme_speed: 'speed',
} as const;

function switchMainFlare(erupt: Tables['sources_erupt'], flare: EruptiveEvent<'flare'>) {
	logMessage(`FLR: ${erupt.flr_source} -> ${flare.src} in ERUPT #${erupt.id}`);
	const ar = erupt.active_region;
	assignFlareToErupt(erupt, flare);
	erupt.active_region = ar ?? flare.active_region;
	makeSourceChanges('sources_erupt', erupt);
}

function switchMainCME(erupt: Tables['sources_erupt'], cme: EruptiveEvent<'cme'>) {
	logMessage(`CME: ${erupt.cme_source} -> ${cme.src} in ERUPT #${erupt.id}`);
	assignCMEToErupt(erupt, cme);
	makeSourceChanges('sources_erupt', erupt);
}

function switchCoordsSrc(
	erupt: Tables['sources_erupt'],
	opt: Tables['sources_erupt']['coords_source'],
	sth?: EruptiveEvent<'cme' | 'flare'>,
) {
	if (opt !== 'MNL') {
		erupt.lat = sth?.lat ?? erupt.lat;
		erupt.lon = sth?.lon ?? erupt.lon;
	}
	erupt.coords_source = opt;
	makeSourceChanges('sources_erupt', erupt);
}

function Menu() {
	const { id: feidId, start } = useFeidCursor();
	const sources = useCurrentFeidSources();
	const menu = useEventsContextMenu<'sources_erupt'>();

	const flares = useCompoundTable('flare');
	const cmes = useCompoundTable('cme');

	const { event: erupt } = menu;
	const eruptId = erupt?.id;
	const isLinked = sources.find((s) => s.erupt?.id === eruptId);

	const [flrOptions, cmeOptions] = (['flare', 'cme'] as const).map((what) => {
		const table = what === 'cme' ? cmes : flares;
		if (!table || !erupt) return [];
		return Object.values(compoundTables[what])
			.map((ent) => {
				const src = sourceLabels[ent];
				const [lnkCol, idCol] = sourceLinks[ent];
				const row = table.data?.find((r) => r[0] === src && equalValues(r[table.index[idCol as 'id']!], erupt[lnkCol]));
				return row ? table.entry(row) : null;
			})
			.filter((a): a is EruptiveEvent<'cme'> | EruptiveEvent<'flare'> => !!a);
	});

	const coordsOptions = ['MNL', ...(flrOptions.length ? ['FLR' as const] : []), ...cmeOptions.map((cme) => cme.src)] as const;

	return (
		eruptId && (
			<>
				{(
					[
						['coords', 'coords_source', coordsOptions],
						['flare', 'flr_source', flrOptions.map((o) => o.src)],
						['CME', 'cme_source', cmeOptions.map((o) => o.src)],
					] as const
				).map(([what, key, options]) => (
					<div className="flex" key={what}>
						Set {what} src:
						<SimpleSelect
							className="w-14 ml-1 bg-input-bg"
							value={erupt[key]}
							options={options}
							onChange={(val) => {
								if (what === 'flare') switchMainFlare(erupt, flrOptions.find((flr) => flr.src === val) as any);
								else if (what === 'CME') switchMainCME(erupt, cmeOptions.find((cme) => cme.src === val) as any);
								else {
									if (val === 'MNL') switchCoordsSrc(erupt, val);
									const sth =
										val === 'FLR'
											? flrOptions.find((flr) => flr.src === erupt.flr_source)
											: cmeOptions.find((cme) => cme.src === val);
									if (sth) switchCoordsSrc(erupt, val as any, sth);
								}
							}}
						/>
					</div>
				))}

				{feidId && !isLinked && (
					<Button onClick={() => linkSrcToEvent(ENT, eruptId, feidId)}>
						Link to <span className="text-xs">{prettyDate(start, true)}</span> FEID
					</Button>
				)}
				{feidId && isLinked && (
					<Button onClick={() => deleteEvent('feid_sources', isLinked.source.id as number)}>
						Unlink from <span className="text-xs">{prettyDate(start, true)}</span> FEID
					</Button>
				)}
				<Button onClick={() => deleteEvent(ENT, eruptId)}>Delete eruption</Button>
			</>
		)
	);
}

function useAssociated<W extends 'flare' | 'cme'>(what: W) {
	const { data, entry } = useTable(ENT);
	const srcTable = useCompoundTable(what);

	return useMemo(() => {
		console.time('erupt assoc ' + what);
		// To optimize for large flares talbe we first use binary search on flares/cmes times to find approx index
		const srcTimeColIdx = (srcTable?.index as any)?.[what === 'cme' ? 'time' : 'start_time'];
		const srcTimes = srcTable?.data.map((row) => (row[srcTimeColIdx] as Date)?.getTime());

		const res = data.map((eruptRow) => {
			const { id, ...erupt } = entry(eruptRow);
			const src = erupt[what === 'cme' ? 'cme_source' : 'flr_source'];
			if (src === 'MNL' || !src || !srcTable || !srcTimes) return null;
			const lnk = getSourceLink(what, src as EruptSrcLabel<W>);
			const idColIdx = srcTable.index[lnk.id]!;
			const linkVal = erupt[lnk.link];
			if (!linkVal) return null;
			const time = (erupt.cme_time ?? erupt.flr_start)?.getTime() ?? 0;
			const approxIdx = binarySearch(srcTimes, time, 32);
			const sliced = srcTable.data.slice(Math.max(0, approxIdx - 100), approxIdx + 100);
			const found = sliced.find((row) => equalValues(row[idColIdx], linkVal) && row[0] === src);
			return found ? srcTable.entry(found) : null;
		});
		console.timeEnd('erupt assoc ' + what);

		return res;
	}, [data, entry, srcTable, what]);
}

function Panel() {
	const { data, columns, entry } = useTable(ENT);
	const selectedErupt = useSelectedSource(ENT);
	const feidSrc = useTable('feid_sources');
	const cmes = useCompoundTable('cme');
	const sources = useCurrentFeidSources();
	const { start: cursorTime, id: feidId } = useFeidCursor();

	useEventListener('setSolarCoordinates', ({ detail: { lat, lon, time } }) => {
		feidId && inputEruptionManually({ lat, lon, time }, feidId, selectedErupt?.id ?? null);
	});

	const associatedFlares = useAssociated('flare');

	const associatedCmes = useAssociated('cme');

	if (!data.length) return <div className="center">LOADING..</div>;

	const focusTime = cursorTime && cursorTime.getTime() - 3 * 864e5;
	const focusIdxx = selectedErupt
		? data.findIndex((r) => selectedErupt?.id === r[0])
		: focusTime == null
			? data.length
			: data.findIndex((r) => (r[1] as Date)?.getTime() > focusTime);
	const focusIdx = focusIdxx < 0 ? data.length : focusIdxx;

	const isLinkedModified = (val: TableValue, col: TableColumn, ridx: number) => {
		const flr = associatedFlares[ridx];
		const cme = associatedCmes[ridx];
		const erupt = entry(data[ridx]);

		if (col.sql_name === 'cme_source') return erupt.cme_source && erupt.cme_source !== 'MNL' && !cme;
		if (col.sql_name === 'flr_source') return erupt.flr_source && erupt.cme_source !== 'MNL' && !flr;

		const colKey = col.sql_name as keyof typeof erupt;

		if (colKey === 'lat' || colKey === 'lon') {
			if (erupt.coords_source === 'FLR') {
				return !flr || val !== flr[colKey];
			}

			const src = erupt.coords_source;
			if (!src || src === 'MNL' || !cmes) return false;

			const lnk = getSourceLink('cme', src);
			const idColIdx = cmes.index[lnk.id]!;
			const linkVal = erupt[lnk.link];
			const targetRow = cmes.data.find((row) => equalValues(row[idColIdx], linkVal) && row[0] === src);
			const targetCme = targetRow && cmes.entry(targetRow);
			return val !== targetCme?.[colKey];
		}

		const cmeKey = cmeSourcedColumns[colKey as keyof typeof cmeSourcedColumns];
		if (cmeKey) {
			if (erupt.cme_source === 'MNL' || (!erupt.cme_source && val == null)) return false;
			return !cme || !equalValues(val, cme[cmeKey]);
		}

		const flrKey = flrSourcedColumns[colKey as keyof typeof flrSourcedColumns];
		if (flrKey) {
			if (!erupt.flr_source && val == null) return false;
			if (!flr) return true;
			const targetVal = colKey === 'flr_flux' ? parseFlareFlux(flr.class) : flr[flrKey];
			return !equalValues(val, targetVal);
		}

		return false;
	};

	return (
		<EventsTable
			{...{
				entity: ENT,
				data,
				columns,
				focusIdx,
				enableEditing: true,
				rowClassName: (row) => {
					const eruptId = row[0];
					const orphan = feidSrc.data.length && !feidSrc.data.find((r) => r[feidSrc.index.erupt_id] === eruptId);
					if (orphan) return 'text-red';
					const selected = eruptId === selectedErupt?.id;
					if (selected) return 'text-cyan';
					const unrelated = !sources.find((src) => src.erupt?.id === eruptId);
					if (unrelated) return 'text-dark';
				},
				cellContent: (val, col, ridx) => (
					<>
						{valueToString(val)}
						{isLinkedModified(val, col, ridx) && <span className="mark-modified" />}
					</>
				),
			}}
		/>
	);
}

export const EruptionsTable = {
	name: 'Erupt Src Table',
	Panel,
	Menu,
};
