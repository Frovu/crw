import { useContext } from 'react';
import { LayoutContext, type ContextMenuProps } from '../../layout';
import { CellInput, DefaultCell, DefaultHead, DefaultRow, TableWithCursor } from './Table';
import { equalValues, valueToString, type TableMenuDetails } from '../core/util';
import { logMessage, useContextMenu } from '../../app';
import { useFeidCursor, useSelectedSource, useCurrentFeidSources } from '../core/eventsState';
import {
	assignCMEToErupt,
	assignFlareToErupt,
	getSourceLink,
	inputEruptionManually,
	linkSrcToEvent,
	parseFlareFlux,
} from '../core/sourceActions';
import { useEventListener } from '../../util';

const ENT = 'sources_erupt';
const flare_columns = {
	flr_start: 'start_time',
	flr_peak: 'peak_time',
	flr_end: 'end_time',
	flr_flux: 'class',
	active_region: 'active_region',
	lat: 'lat',
	lon: 'lon',
} as const;

function switchMainFlare(erupt: SrcEruptRow, flare: Flare) {
	logMessage(`FLR: ${erupt.flr_source} -> ${flare.src} in ERUPT #${erupt.id}`);
	const ar = erupt.active_region;
	assignFlareToErupt(erupt, flare);
	erupt.active_region = ar ?? flare.active_region;
	makeSourceChanges('sources_erupt', erupt);
}

function switchMainCME(erupt: SrcEruptRow, cme: CME) {
	logMessage(`CME: ${erupt.cme_source} -> ${cme.src} in ERUPT #${erupt.id}`);
	assignCMEToErupt(erupt, cme);
	makeSourceChanges('sources_erupt', erupt);
}

function switchCoordsSrc(erupt: SrcEruptRow, opt: string, sth?: CME | Flare) {
	if (opt !== 'MNL') {
		erupt.lat = sth?.lat ?? null;
		erupt.lon = sth?.lon ?? null;
	}
	erupt.coords_source = opt;
	makeSourceChanges('sources_erupt', erupt);
}

function Menu({ params, setParams }: ContextMenuProps<Partial<{}>>) {
	const { id: feidId } = useFeidCursor();
	const sources = useCurrentFeidSources();
	const detail = useContextMenu((state) => state.menu?.detail) as TableMenuDetails | undefined;
	const eruptId = detail?.cell?.id;
	const isLinked = sources.find((s) => s.erupt?.id === eruptId);

	return (
		eruptId && (
			<>
				{feidId && !isLinked && (
					<button className="TextButton" onClick={() => linkSrcToEvent(ENT, eruptId, feidId)}>
						Link Erupt
					</button>
				)}
				{feidId && isLinked && (
					<button className="TextButton" onClick={() => deleteEvent('feid_sources', isLinked.source.id as number)}>
						Unlink Erupt
					</button>
				)}
				<button className="TextButton" onClick={() => deleteEvent(ENT, eruptId)}>
					Delete row
				</button>
			</>
		)
	);
}

function Panel() {
	const sCursor = useEntityCursor();
	const { data, columns } = useTable(ENT);
	const feidSrc = useTable('feid_sources');
	const flares = useCompoundTable('flare');
	const cmes = useCompoundTable('cme');
	const sources = useCurrentFeidSources();
	const selectedErupt = useSelectedSource('sources_erupt');
	const { start: cursorTime, id: feidId } = useFeidCursor();

	const cursor = sCursor?.entity === ENT ? sCursor : null;

	useTableQuery('feid_sources');
	useTableQuery(ENT);

	useEventListener('setSolarCoordinates', ({ detail: { lat, lon, time } }) => {
		feidId && inputEruptionManually({ lat, lon, time }, feidId, selectedErupt?.id ?? null);
	});

	const { id: nodeId, size } = useContext(LayoutContext)!;
	if (!data || !feidSrc.data || !columns) return <div className="Center">LOADING..</div>;

	const focusTime = cursorTime && cursorTime.getTime() - 3 * 864e5;
	const focusIdxx =
		sources.map((src) => data.findIndex((r) => src.erupt?.id === r[0])).find((i) => i > 0) ||
		(focusTime == null ? data.length : data.findIndex((r) => (r[1] as Date)?.getTime() > focusTime));
	const focusIdx = focusIdxx < 0 ? data.length : focusIdxx;

	return (
		<TableWithCursor
			{...{
				data,
				columns,
				size,
				focusIdx,
				entity: ENT,
				allowEdit: true,
				head: (cols, padHeader) => <DefaultHead {...{ columns: cols.slice(1), padHeader }} />,
				row: (row, idx, onClick, padRow) => {
					const erupt = rowAsDict(row, columns) as SrcEruptRow;
					const cyan = erupt.id === selectedErupt?.id;
					const dark = !sources.find((src) => src.erupt?.id === erupt.id);
					// FIXME: do this for all eruptions at load
					const flare =
						erupt.flr_source === 'MNL'
							? null
							: (() => {
									const [linkColId, idColId] = getSourceLink('flare', erupt.flr_source);
									const idColIdx = flares.columns?.findIndex((col) => col.id === idColId);
									const flr =
										erupt[linkColId] &&
										flares.data?.find(
											(r) => equalValues(r[idColIdx], erupt[linkColId]) && r[0] === erupt.flr_source
										);
									return flr ? (rowAsDict(flr, flares.columns) as Flare) : null;
							  })();
					const orphan = !feidSrc.data.find((r) => r[eruptIdIdx] === row[0]);

					const className = orphan ? 'text-red' : cyan ? 'text-cyan' : dark ? 'text-text-dark' : 'text-text';

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
					);
				},
			}}
		/>
	);
}

export const EruptionsTable = {
	name: 'Erupt Src Table',
	Panel,
	Menu,
};
