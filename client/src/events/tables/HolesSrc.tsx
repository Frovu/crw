import { useContext, useEffect, useState } from 'react';
import { color, openContextMenu } from '../../app';
import { LayoutContext, openWindow } from '../../layout';
import { DefaultHead, TableWithCursor } from './TableView';
import { equalValues, valueToString } from '../events';
import { rowAsDict, useEventsState, useFeidCursor, useSource, useSources, useTable } from '../eventsState';
import { timeInMargin, type CHS } from '../sources';

export default function HolesSourceTable() {
	const { id: nodeId, size } = useContext(LayoutContext)!;
	const { cursor: sCursor } = useEventsState();
	const { start: cursorTime, row: feid, id: feidId } = useFeidCursor();
	const { data, columns } = useTable('sources_ch');
	const sourceCh = useSource('sources_ch');
	const sources = useSources();
	const cursor = sCursor?.entity === 'sources_ch' ? sCursor : null;

	const focusTime = cursorTime && (cursorTime.getTime() - 2 * 864e5);
	const focusIdx = sources.map(src => data.findIndex(r => src.erupt?.id === r[0])).find(i => i > 0) ||
	  (focusTime == null ? data.length : data.findIndex(r => (r[1] as Date)?.getTime() > focusTime));

	return <div>
		{<TableWithCursor {...{
			entity: 'sources_ch',
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
						return <td key={column.id} title={(cidx === 1 ? `id = ${row[0]}; ` : '') + `${column.fullName} = ${value}`}
							onClick={e => {
								if (cidx === 0) {
									// if (feidId)
									// 	linkEruptiveSourceEvent('icme', rowAsDict(row as any, columns), feidId);
									// return;
								}
								onClick(idx, cidx);
							}}
							onContextMenu={openContextMenu('events', { nodeId, ch } as any)}
							style={{ borderColor: color(curs ? 'active' : 'border') }}>
							<span className='Cell' style={{
								width: column.width + 'ch',
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