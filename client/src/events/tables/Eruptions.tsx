import { useContext } from 'react';
import { LayoutContext, type ContextMenuProps } from '../../layout';
import { CellInput, DefaultHead, TableWithCursor } from './TableView';
import { equalValues, valueToString, type CME, type Flare, type SrcEruptRow, type TableMenuDetails } from '../events';
import { color, logMessage, openContextMenu, useContextMenu } from '../../app';
import { deleteEvent, eruptIdIdx, makeSourceChanges, rowAsDict, useEventsState, useFeidCursor, useSource, useSources, useTable } from '../eventsState';
import { assignCMEToErupt, assignFlareToErupt, getSourceLink, linkSrcToEvent, parseFlareFlux, sourceLabels, useCompoundTable, useTableQuery } from '../sources';

const ENT = 'sources_erupt';
const flare_columns = {
	flr_start: 'start_time',
	flr_peak: 'peak_time',
	flr_end: 'end_time',
	flr_flux: 'class',
	active_region: 'active_region',
	lat: 'lat',
	lon: 'lon'
} as { [k: string]: keyof Flare } ;

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
	const sources = useSources();
	const detail = useContextMenu(state => state.menu?.detail) as TableMenuDetails | undefined;
	const eruptId = detail?.cell?.id;
	const isLinked = sources.find(s => s.erupt?.id === eruptId);

	return eruptId && <>
		{feidId && !isLinked && <button className='TextButton'
			onClick={() => linkSrcToEvent(ENT, eruptId, feidId)}>Link Erupt</button>}
		{feidId && isLinked && <button className='TextButton'
			onClick={() => deleteEvent('feid_sources', isLinked.source.id as number)}>Unlink Erupt</button>}
		<button className='TextButton' onClick={() => deleteEvent(ENT, eruptId)}>Delete row</button>
	</>;
}

function Panel() {
	const { cursor: sCursor } = useEventsState();
	const { data, columns } = useTable(ENT);
	const feidSrc = useTable('feid_sources');
	const flares = useCompoundTable('flare');
	const cmes = useCompoundTable('cme');
	const sources = useSources();
	const selectedErupt = useSource('sources_erupt');
	const { start: cursorTime } = useFeidCursor();

	const cursor = sCursor?.entity === ENT ? sCursor : null;

	useTableQuery(ENT);

	const { id: nodeId, size } = useContext(LayoutContext)!;
	if (!data || !columns)
		return <div className='Center'>LOADING..</div>;
	
	const focusTime = cursorTime && (cursorTime.getTime() - 2 * 864e5);
	const focusIdx = sources.map(src => data.findIndex(r => src.erupt?.id === r[0])).find(i => i > 0) ||
	  (focusTime == null ? data.length : data.findIndex(r => (r[1] as Date)?.getTime() > focusTime));

	return <TableWithCursor {...{
		data, columns, size, focusIdx, entity: ENT,
		allowEdit: true,
		head: (cols, padHeader) => <DefaultHead {...{ columns: cols.slice(1), padHeader }}/>,
		row: (row, idx, onClick, padRow) => {
			const erupt = rowAsDict(row, columns) as SrcEruptRow;
			const cyan = erupt.id === selectedErupt?.id;
			const dark = !sources.find(src => src.erupt?.id === erupt.id);
			// FIXME: do this for all eruptions at load
			const flare = erupt.flr_source === 'MNL' ? null : (() => {
				const [linkColId, idColId] = getSourceLink('flare', erupt.flr_source);
				const idColIdx = flares.columns?.findIndex(col => col.id === idColId);
				const flr = erupt[linkColId] && flares.data?.find(r => equalValues(r[idColIdx], erupt[linkColId]));
				return flr ? rowAsDict(flr, flares.columns) as Flare: null;
			})();
			const orphan = !feidSrc.data.find(r => r[eruptIdIdx] === row[0]);
			return <tr key={row[0]}
				style={{ height: 23 + padRow, fontSize: 15 }}>
				{columns.slice(1).map((column, scidx) => {
					const cidx = scidx + 1;
					const cid = column.id;
					const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
					const isLinkedModified = flare_columns[cid] ? (() => {
						if (['lat', 'lon'].includes(cid) && erupt.coords_source !== 'FLR')
							return false; // FIXME
						if (!flare)
							return !flares.data;
						const val = cid === 'flr_flux'
							? flare.flux ?? parseFlareFlux(flare.class)
							: flare[flare_columns[cid]];
						return !equalValues(val, row[cidx]);
					})() : null;
					const flrOpts = (curs && ['flr_source', 'coords_source'].includes(cid)) ? sourceLabels.flare.map(flrSrc => {
						const [linkColId, idColId] = getSourceLink('flare', flrSrc);
						const idColIdx = flares.columns?.findIndex(col => col.id === idColId);
						const flr = erupt[linkColId] && flares.data?.find(r =>
							equalValues(r[idColIdx], erupt[linkColId]));
						return flr ? rowAsDict(flr, flares.columns!) as Flare : null;
					}).filter(s => s) : [];
					const cmeOpts = (curs && ['cme_source', 'coords_source'].includes(cid)) ? sourceLabels.cme.map(cmeSrc => {
						const [linkColId, idColId] = getSourceLink('cme', cmeSrc);
						const idColIdx = cmes.columns?.findIndex(col => col.id === idColId);
						const cme = erupt[linkColId] && cmes.data?.find(r =>
							equalValues(r[idColIdx], erupt[linkColId]));
						return cme ? rowAsDict(cme, cmes.columns!) as CME : null;
					}).filter(s => s) : [];
					let value = valueToString(row[cidx]);
					if (['XF peak', 'XF end'].includes(column.name))
						value = value.split(' ')[1];
					const width = ['XF peak', 'XF end'].includes(column.name) ? 6 : 
						['lat', 'lon'].includes(column.name) ? 4.5 : column.width;
					return <td key={cid} title={cidx === 1 ? `id = ${row[0]}` : `${column.fullName} = ${value}`}
						onClick={e => onClick(idx, cidx)}
						onContextMenu={openContextMenu('events', { nodeId, cell: { id: row[0] } as any })}
						style={{ borderColor: curs ? 'var(--color-active)' : 'var(--color-border)' }}>
						{curs?.editing || (curs && column.type === 'enum') ? <CellInput {...{
							table: ENT,
							options: cid === 'coords_source' ?
								[...(flrOpts.length ? ['FLR'] : ['']), 'MNL'].concat(cmeOpts.map(c => c!.src as string))
								: (cid === 'flr_source' ? flrOpts : cmeOpts)?.map(a => a!.src as string),
							id: row[0],
							column, value,
							change: cid === 'flr_source' ? (val: any) => {
								const flr = flrOpts.find(fl => fl!.src === val);
								if (flr)
									switchMainFlare(erupt, flr);
								return !!flr;
							} : cid === 'cme_source' ? (val: any) => {
								const cme = cmeOpts.find(fl => fl!.src === val);
								if (cme)
									switchMainCME(erupt, cme);
								return !!cme;
							} : cid === 'coords_source' ? (val: any) => {
								if (val === 'MNL') {
									switchCoordsSrc(erupt, val);
									return true;
								}
								const obj = val === 'FLR' ? flrOpts.find(fl => fl!.src === erupt.flr_source)
									: cmeOpts.find(fl => fl!.src === val);
								if (obj)
									switchCoordsSrc(erupt, val, obj);
								return !!obj;
							} : undefined
						}}/> : <span className='Cell' style={{ width: width + 'ch',
							color: color(orphan ? 'red' : cyan ? 'cyan' : dark ? 'text-dark' : 'text')  }}>
							<div className='TdOver'/>
							{value}
							{isLinkedModified && <span className='ModifiedMarker'/>}
						</span>}
					</td>;
				})}
			</tr>;}
	}}/>;
}

export const EruptionsTable = {
	name: 'Erupt Src Table',
	Panel,
	Menu
};