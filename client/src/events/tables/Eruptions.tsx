import { useContext, useMemo } from 'react';
import { LayoutContext, type ContextMenuProps } from '../../layout';
import { EventsTable, type TableColumn } from './Table';
import { equalValues, valueToString } from '../core/util';
import { logMessage, useContextMenu, useContextMenuStore, useEventsContextMenu } from '../../app';
import { useFeidCursor, useSelectedSource, useCurrentFeidSources, useEntityCursor } from '../core/eventsState';
import {
	assignCMEToErupt,
	assignFlareToErupt,
	getSourceLink,
	inputEruptionManually,
	linkSrcToEvent,
	parseFlareFlux,
	type EruptiveEvent,
	type EruptSrcLabel,
} from '../core/sourceActions';
import { binarySearch, useEventListener } from '../../util';
import { deleteEvent, makeSourceChanges, useTable, type TableValue } from '../core/editableTables';
import { sourceLabels, type Tables } from '../../api';
import { useCompoundTable } from '../core/query';
import { Button } from '../../components/Button';

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
		erupt.lat = sth?.lat ?? null;
		erupt.lon = sth?.lon ?? null;
	}
	erupt.coords_source = opt;
	makeSourceChanges('sources_erupt', erupt);
}

function useAssociated<W extends 'flare' | 'cme'>(what: W) {
	const { data, entry } = useTable(ENT);
	const srcTable = useCompoundTable(what);

	return useMemo(() => {
		console.time('erupt assoc ' + what);
		// To optimize for large flares talbe we first use binary search on flares/cmes times to find approx index
		const srcTimeColIdx = (srcTable?.index as any)[what === 'cme' ? 'time' : 'start_time'];
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

function Menu() {
	const { id: feidId } = useFeidCursor();
	const sources = useCurrentFeidSources();
	const menu = useEventsContextMenu<'sources_erupt'>();
	const eruptId = menu.event?.id;
	const isLinked = sources.find((s) => s.erupt?.id === menu?.event);

	return (
		eruptId && (
			<>
				{feidId && !isLinked && <Button onClick={() => linkSrcToEvent(ENT, eruptId, feidId)}>Link Erupt</Button>}
				{feidId && isLinked && (
					<Button onClick={() => deleteEvent('feid_sources', isLinked.source.id as number)}>Unlink Erupt</Button>
				)}
				<Button onClick={() => deleteEvent(ENT, eruptId)}>Delete row</Button>
			</>
		)
	);
}

function Panel() {
	const { id: nodeId, size } = useContext(LayoutContext)!;
	const cursor = useEntityCursor(ENT);
	const { data, columns, index, entry } = useTable(ENT);
	const selectedErupt = useSelectedSource(ENT);
	const feidSrc = useTable('feid_sources');
	const flares = useCompoundTable('flare');
	const cmes = useCompoundTable('cme');
	const sources = useCurrentFeidSources();
	const { start: cursorTime, id: feidId } = useFeidCursor();

	useEventListener('setSolarCoordinates', ({ detail: { lat, lon, time } }) => {
		feidId && inputEruptionManually({ lat, lon, time }, feidId, selectedErupt?.id ?? null);
	});

	const associatedFlares = useAssociated('flare');

	const associatedCmes = useAssociated('cme');

	if (!data || !feidSrc.data || !columns) return <div className="center">LOADING..</div>;

	const focusTime = cursorTime && cursorTime.getTime() - 3 * 864e5;
	const focusIdxx =
		sources.map((src) => data.findIndex((r) => src.erupt?.id === r[0])).find((i) => i > 0) ||
		(focusTime == null ? data.length : data.findIndex((r) => (r[1] as Date)?.getTime() > focusTime));
	const focusIdx = focusIdxx < 0 ? data.length : focusIdxx;

	const isLinkedModified = (val: TableValue, col: TableColumn, ridx: number) => {
		const flr = associatedFlares[ridx];
		const cme = associatedCmes[ridx];
		const erupt = entry(data[ridx]);

		if (col.sql_name === 'cme_source') return erupt.cme_source && !cme;
		if (col.sql_name === 'flr_source') return erupt.flr_source && !flr;

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
			if (!erupt.cme_source && val == null) return false;
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
				data,
				columns,
				size,
				focusIdx,
				entity: ENT,
				enableEditing: true,
				rowClassName: (row) => {
					const eruptId = row[0];
					const orphan = !feidSrc.data.find((r) => r[feidSrc.index.erupt_id] === eruptId);
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

/*
					return (
						<DefaultRow
							key={row[0]}
							{...{ row, idx, columns: columns.slice(1), cursor, className, padRow }}
							onClick={(e, cidx) => onClick(idx, cidx)}
							contextMenuData={() => ({ nodeId, cell: { id: row[0] } })}
							title={(cidx) =>
								(cidx === 1 ? `id = ${row[0]}; ` : '') +
								`${columns[cidx].fullName} = ${valueToString(row[cidx + 1])}`
							}
						>
							{({ column, cidx: scidx, curs }) => {
								const cidx = scidx + 1;
								const cid = column.id;

								const isLinkedModified = flare_columns[cid]
									? (() => {
											if (['lat', 'lon'].includes(cid) && erupt.coords_source !== 'FLR') return false; // FIXME
											if (!flare) return !flares.data;
											const val =
												cid === 'flr_flux'
													? flare.flux ?? parseFlareFlux(flare.class)
													: flare[flare_columns[cid]];
											return !equalValues(val, row[cidx]);
									  })()
									: null;
								const flrOpts =
									curs && ['flr_source', 'coords_source'].includes(cid)
										? sourceLabels.flare
												.map((flrSrc) => {
													const [linkColId, idColId] = getSourceLink('flare', flrSrc);
													const idColIdx = flares.columns?.findIndex((col) => col.id === idColId);
													const flr =
														erupt[linkColId] &&
														flares.data?.find(
															(r) => r[0] === flrSrc && equalValues(r[idColIdx], erupt[linkColId])
														);
													return flr ? (rowAsDict(flr, flares.columns!) as Flare) : null;
												})
												.filter((s) => s)
										: [];
								const cmeOpts =
									curs && ['cme_source', 'coords_source'].includes(cid)
										? sourceLabels.cme
												.map((cmeSrc) => {
													const [linkColId, idColId] = getSourceLink('cme', cmeSrc);
													const idColIdx = cmes.columns?.findIndex((col) => col.id === idColId);
													const cme =
														erupt[linkColId] &&
														cmes.data?.find(
															(r) => r[0] === cmeSrc && equalValues(r[idColIdx], erupt[linkColId])
														);
													console.log(linkColId, idColId, cme);
													return cme ? (rowAsDict(cme, cmes.columns!) as CME) : null;
												})
												.filter((s) => s)
										: [];

								let value = valueToString(row[cidx]);
								if (['XF peak', 'XF end'].includes(column.name)) value = value.split(' ')[1];

								if (!curs?.editing && (!curs || column.type !== 'enum'))
									return (
										<DefaultCell column={column}>
											{value}
											{isLinkedModified && <span className="ModifiedMarker" />}
										</DefaultCell>
									);

								return (
									<CellInput
										{...{
											table: ENT,
											options:
												cid === 'coords_source'
													? [...(flrOpts.length ? ['FLR'] : ['']), 'MNL'].concat(
															cmeOpts.map((c) => c!.src as string)
													  )
													: (cid === 'flr_source' ? flrOpts : cmeOpts)?.map((a) => a!.src as string),
											id: row[0],
											column,
											value,
											change:
												cid === 'flr_source'
													? (val: any) => {
															const flr = flrOpts.find((fl) => fl!.src === val);
															if (flr) switchMainFlare(erupt, flr);
															return !!flr;
													  }
													: cid === 'cme_source'
													? (val: any) => {
															const cme = cmeOpts.find((fl) => fl!.src === val);
															if (cme) switchMainCME(erupt, cme);
															return !!cme;
													  }
													: cid === 'coords_source'
													? (val: any) => {
															if (val === 'MNL') {
																switchCoordsSrc(erupt, val);
																return true;
															}
															const obj =
																val === 'FLR'
																	? flrOpts.find((fl) => fl!.src === erupt.flr_source)
																	: cmeOpts.find((fl) => fl!.src === val);
															if (obj) switchCoordsSrc(erupt, val, obj);
															return !!obj;
													  }
													: undefined,
										}}
									/>
								);
							}}
						</DefaultRow>
					); */

export const EruptionsTable = {
	name: 'Erupt Src Table',
	Panel,
	Menu,
};
