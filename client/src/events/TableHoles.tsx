import { useContext } from 'react';
import { color, openContextMenu } from '../app';
import { LayoutContext } from '../layout';
import { TableWithCursor } from './TableView';
import { fetchTable } from './columns';
import { equalValues, valueToString } from './events';
import { rowAsDict, useEventsState, useFeidCursor, useSource, useSources } from './eventsState';
import { timeInMargin } from './sources';
import { useQuery } from 'react-query';

const SOLEN_PNG_SINCE = new Date(Date.UTC(2015, 12, 12));
const months = ['january', 'february', 'march', 'april', 'may', 'june',' july', 'august', 'september', 'october', 'november', 'december'];

export function HolesLinkView() {
	const { cursor: sCursor } = useEventsState();
	const cursor = sCursor?.entity === 'solen_holes' ? sCursor : null;
	const sch = useSource('sources_ch');
	const sources = useSources();

	const { id: nodeId, size } = useContext(LayoutContext)!;
	const query = useQuery(['solen_holes'], async () => {
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
	const { start: cursorTime, row: feid, id: feidId } = useFeidCursor();
	if (!query.data?.data.length)
		return <div className='Center'>LOADING..</div>;

	const { data, columns } = query.data;
	const rowsHeight = size.height - 28 - 120;
	const rowH = devicePixelRatio < 1 ? 24 + (2 / devicePixelRatio) : 25;
	const viewSize = Math.max(0, Math.floor(rowsHeight / rowH));
	const hRem = rowsHeight % rowH;
	const trPadding = hRem > viewSize ? 1 : 0;
	const headerPadding = (hRem - viewSize * trPadding);
	const focusTime = cursorTime && (cursorTime?.getTime() - 2 * 864e5);
	const focusIdx = focusTime == null ? data.length :
		data.findIndex(r => (r[1] as Date)?.getTime() > focusTime);

	const dt = focusTime == null ? null : new Date(focusTime);
	const ext = (dt && dt >= SOLEN_PNG_SINCE) ? 'png' : 'jpg';
	const y = dt?.getUTCFullYear(), m = dt?.getUTCMonth(), d = dt?.getUTCDate();
	const imgUrl = dt && `https://solen.info/solar/old_reports/${y}/${months[m!-1]}/images/` +
		`AR_CH_${y}${m!.toString().padStart(2, '00')}${d!.toString().padStart(2, '00')}.${ext}`;

	return <div>
		{<TableWithCursor {...{
			entity: 'solen_holes',
			data, columns, size, viewSize, focusIdx, onKeydown: e => {
				// if (cursor && ch && e.key === '-')
				// 	return unlinkEruptiveSourceEvent('solen_holes', rowAsDict(data[cursor.row] as any, columns));
				// if (cursor && ['+', '='].includes(e.key))
				// 	return feidId && linkEruptiveSourceEvent('solen_holes', rowAsDict(data[cursor.row] as any, columns), feidId);
			},
			thead: <tr>{columns.map((col) =>
				<td key={col.id} title={`[${col.name}] ${col.description ?? ''}`} className='ColumnHeader' style={{ cursor: 'auto' }}>
					<div style={{ height: 20 + headerPadding, lineHeight: 1, fontSize: 15 }}>{col.name}</div>
				</td>)}
			</tr>,
			row: (row, idx, onClick) => {
				const ch = rowAsDict(row as any, columns) as { tag: string, time: Date };
				const time = (ch.time as any)?.getTime();
				const linkedToThisCH = equalValues(sch?.tag, ch.tag);
				const linkedToThisFEID = sources.find(s => equalValues(s.ch?.tag, ch.tag));
				
				const orange = !linkedToThisFEID && (feid.s_description as string)?.includes(ch.tag);
				const dark = !orange && !timeInMargin(ch.time, dt, 5 * 24 * 36e5, 1 * 36e5);
			
				return <tr key={row[0]+time+row[2]+row[4]}
					style={{ height: 23 + trPadding, fontSize: 15 }}>
					{columns.map((column, cidx) => {
						const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
						const value = valueToString(row[cidx]);
						const val = column.id === 'tag' ? value.slice(2) : column.id === 'time' ? value.slice(5, 10) : value;
						return <td key={column.id} title={`${column.fullName} = ${value}`}
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
							<span className='Cell' style={{ whiteSpace: 'nowrap', width: column.width + 'ch',
								color: color(linkedToThisCH ? 'cyan' : dark ? 'text-dark' : orange ? 'orange' : 'text') }}>
								<div className='TdOver'/>
								{val}
							</span>
						</td>;
					})}
				</tr>;}
		}}/>}
		{imgUrl && <img alt='' src={imgUrl}></img>}
	</div> ;

}