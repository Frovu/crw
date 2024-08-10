import { useContext } from 'react';
import { color, openContextMenu, useContextMenu } from '../../app';
import { LayoutContext, type ContextMenuProps } from '../../layout';
import { DefaultHead, TableWithCursor } from './TableView';
import { equalValues, valueToString } from '../events';
import { deleteEvent, rowAsDict, useEventsState, useFeidCursor, useSource, useSources, useTable } from '../eventsState';
import { linkSrcToEvent, timeInMargin, useTableQuery, type CHS } from '../sources';
import { askConfirmation } from '../../Utility';

const ENT = 'sources_ch';

function deleteHole(id: number) {
	askConfirmation(<><h4>Delete CHS event?</h4><p>Action is irreversible</p></>,
		() => deleteEvent(ENT, id));
}

function Menu({ params, setParams }: ContextMenuProps<Partial<{}>>) {
	const { id: feidId } = useFeidCursor();
	const detail = useContextMenu(state => state.menu?.detail) as { ch: CHS } | undefined;
	const sources = useSources();
	const chsId = detail?.ch?.id;
	const isLinked = sources.find(s => s.ch?.id === chsId);

	return chsId && <>
		{feidId && !isLinked && <button className='TextButton'
			onClick={() => linkSrcToEvent(ENT, chsId, feidId)}>Link CHS</button>}
		{feidId && isLinked && <button className='TextButton'
			onClick={() => deleteEvent('feid_sources', isLinked.source.id as number)}>Unlink CHS</button>}
		<button className='TextButton' onClick={() => deleteHole(chsId)}>Delete row</button>
	</>;
}

function Panel() {
	const { id: nodeId, size } = useContext(LayoutContext)!;
	const { cursor: sCursor } = useEventsState();
	const { start: cursorTime, row: feid } = useFeidCursor();
	const { data, columns } = useTable(ENT);
	const sourceCh = useSource(ENT);
	const sources = useSources();
	const cursor = sCursor?.entity === ENT ? sCursor : null;

	useTableQuery(ENT);

	if (!data || !columns)
		return <div className='Center'>LOADING..</div>;

	const focusTime = cursorTime && (cursorTime.getTime() - 2 * 864e5);
	const focusIdx = sources.map(src => data.findIndex(r => src.ch?.id === r[0])).find(i => i > 0) ||
	  (focusTime == null ? data.length : data.findIndex(r => (r[1] as Date)?.getTime() > focusTime));

	return <div>
		{<TableWithCursor {...{
			entity: ENT,
			data, columns, size, focusIdx,
			head: (cols, padHeader) => <DefaultHead {...{ columns: cols.slice(1), padHeader }}/>,
			row: (row, idx, onClick, padRow) => {
				const ch = rowAsDict(row as any, columns) as CHS;
				const linkedToThisCH = equalValues(sourceCh?.tag, ch.tag);
				const linkedToThisFEID = sources.find(s => equalValues(s.ch?.tag, ch.tag));
				
				const orange = !linkedToThisFEID && (feid.s_description as string)?.includes(ch.tag);
				const dark = !orange && !timeInMargin(ch.time, focusTime && new Date(focusTime), 5 * 24 * 36e5, 1 * 36e5);
			
				return <tr key={row[0]}
					style={{ height: 23 + padRow, fontSize: 15 }}>
					{columns.slice(1).map((column, scidx) => {
						const cidx = scidx + 1;
						const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
						const value = valueToString(row[cidx]);
						const width = 'tag' === column.id ? 7.5 : 
							['b', 'phi', 'lat', 'area', 'width'].includes(column.id) ? 4.5 : column.width;
						return <td key={column.id} title={(cidx === 1 ? `id = ${row[0]}; ` : '') + `${column.fullName} = ${value}`}
							onClick={e => onClick(idx, cidx)}
							onContextMenu={openContextMenu('events', { nodeId, ch } as any)}
							style={{ borderColor: color(curs ? 'active' : 'border') }}>
							<span className='Cell' style={{
								width: width + 'ch',
								color: color(linkedToThisCH ? 'cyan' : dark ? 'text-dark' : orange ? 'orange' : 'text') }}>
								<div className='TdOver'/>
								{value}
							</span>
						</td>;
					})}
				</tr>;}
		}}/>}
	</div>;
}

export const HolesTable = {
	name: 'Holes Src Table',
	Panel,
	Menu
};