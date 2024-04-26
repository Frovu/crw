import { useContext } from 'react';
import { LayoutContext, type ContextMenuProps } from '../layout';
import { CellInput, TableWithCursor } from './TableView';
import { equalValues, valueToString, type TableMenuDetails } from './events';
import { color, logError, logMessage, openContextMenu, useContextMenu } from '../app';
import { deleteEvent, flaresLinkId, makeSourceChanges, rowAsDict, useEventsState, useSources, useTable, type RowDict } from './eventsState';
import { assignFlareToErupt, getFlareLink, parseFlareFlux, useFlaresTable, useTableQuery } from './sources';
import { apiPost } from '../util';
import { askConfirmation } from '../Utility';

const ENT = 'sources_erupt';
const flare_columns = {
	flr_start: 'start_time',
	flr_peak: 'peak_time',
	flr_end: 'end_time',
	flr_flux: 'class',
	active_region: 'active_region',
	lat: 'lat',
	lon: 'lon'
} as { [k: string]: string };

function deleteEruption(id: number) {
	askConfirmation(<><h4>Delete eruption event?</h4><p>Action is irreversible</p></>, async () => {
		try {
			await apiPost('events/delete', { entity: ENT, id });
			deleteEvent(ENT, id);
		} catch(e) {
			logError(e?.toString());
		}
	});
}

function switchMainFlare(erupt: RowDict, flare: RowDict) {
	logMessage(`FLR: ${erupt.flr_source} -> ${flare.src} in ERUPT #${erupt.id}`);
	assignFlareToErupt(erupt, flare);
	makeSourceChanges('sources_erupt', erupt);
}

export function EruptionsContextMenu({ params, setParams }: ContextMenuProps<Partial<{}>>) {
	const detail = useContextMenu(state => state.menu?.detail) as TableMenuDetails | undefined;
	const eruptId = detail?.cell?.id;

	return <>
		{eruptId && <button className='TextButton' onClick={() => deleteEruption(eruptId)}>Delete row</button>}
	</>;
}

export default function EruptionsTable() {
	const { cursor: sCursor } = useEventsState();
	const { data, columns } = useTable(ENT);
	const flares = useFlaresTable();
	const sources = useSources();

	const cursor = sCursor?.entity === ENT ? sCursor : null;

	useTableQuery(ENT);

	const { id: nodeId, size } = useContext(LayoutContext)!;
	if (!data || !columns)
		return <div className='Center'>LOADING..</div>;
	const rowsHeight = size.height - 34;
	const rowH = devicePixelRatio < 1 ? 24 + (2 / devicePixelRatio) : 25;
	const viewSize = Math.max(0, Math.floor(rowsHeight / rowH));
	const hRem = rowsHeight % rowH;
	const trPadding = hRem > viewSize ? 1 : 0;
	const headerPadding = (hRem - viewSize * trPadding);

	return <TableWithCursor {...{
		data, columns, size, viewSize, entity: ENT,
		allowEdit: true,
		thead: <tr>{columns.map((col) =>
			<td key={col.id} title={`[${col.name}] ${col.description ?? ''}`} className='ColumnHeader'>
				<div style={{ height: 26 + headerPadding, lineHeight: 1, fontSize: 15 }}>{col.name}</div>
			</td>)}
		</tr>,
		row: (row, idx, onClick) => {
			const dark = !sources.find(src => src.erupt?.id === row[0]);
			const erupt = rowAsDict(row, columns);
			// FIXME: do this for all eruptions at load
			const flare = erupt.flr_source === 'MNL' ? null : (() => {
				const { linkColId, idColId } = getFlareLink(erupt.flr_source);
				const idColIdx = flares.columns?.findIndex(col => col.id === idColId);
				const flr = flares.data?.find(r => equalValues(r[idColIdx], erupt[linkColId]));
				return flr ? rowAsDict(flr, flares.columns) : null;
			})();
			return <tr key={row[0]}
				style={{ height: 23 + trPadding, fontSize: 15 }}>
				{columns.map((column, cidx) => {
					const cid = column.id;
					const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
					const isLinkedModified = flare_columns[cid] ? (() => {
						if (['lat', 'lon'].includes(cid) && erupt.coords_source !== 'FLR')
							return false; // FIXME
						if (!flare)
							return !flares.data;
						const val = cid === 'flr_flux'
							? flare.flux ?? parseFlareFlux(flare.class as any)
							: flare[flare_columns[cid]];
						return !equalValues(val, row[cidx]);
					})() : null;
					const flrOpts = (curs && cid === 'flr_source') ? Object.keys(flaresLinkId).map(flrSrc => {
						if (flrSrc === erupt.flr_source)
							return flare;
						const { linkColId, idColId } = getFlareLink(flrSrc);
						const idColIdx = flares.columns?.findIndex(col => col.id === idColId);
						const flr = erupt[linkColId] && flares.data?.find(r =>
							equalValues(r[idColIdx], erupt[linkColId]));
						return flr ? rowAsDict(flr, flares.columns!) : null;
					}).filter(s => s) : [];

					let value = valueToString(row[cidx]);
					if (['XF peak', 'XF end'].includes(column.name))
						value = value.split(' ')[1];
					const width = ['XF peak', 'XF end'].includes(column.name) ? 6 : 
						['lat', 'lon'].includes(column.name) ? 4.5 : column.width;
					return <td key={cid} title={`${column.fullName} = ${value}`}
						onClick={e => onClick(idx, cidx)}
						onContextMenu={openContextMenu('events', { nodeId, cell: { id: row[0] } as any })}
						style={{ borderColor: curs ? 'var(--color-active)' : 'var(--color-border)' }}>
						{curs?.editing || (curs && column.type === 'enum') ? <CellInput {...{
							table: ENT,
							options: flrOpts?.map(fl => fl!.src as string),
							id: row[0],
							column, value,
							change: cid === 'flr_source' ? (val: any) => {
								const flr = flrOpts.find(fl => fl!.src === val);
								if (flr)
									switchMainFlare(erupt, flr);
								return !!flr;
							} : undefined
						}}/> : <span className='Cell' style={{ width: width + 'ch', color: color(dark ? 'text-dark' : 'text')  }}>
							<div className='TdOver'/>
							{value}
							{isLinkedModified && <span className='ModifiedMarker'/>}
						</span>}
					</td>;
				})}
			</tr>;}
	}}/>;
}