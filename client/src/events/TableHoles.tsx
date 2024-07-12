import { useContext, useEffect, useState } from 'react';
import { color, openContextMenu } from '../app';
import { LayoutContext, openWindow } from '../layout';
import { TableWithCursor } from './TableView';
import { fetchTable } from './columns';
import { equalValues, valueToString } from './events';
import { rowAsDict, useEventsState, useFeidCursor, useSource, useSources } from './eventsState';
import { timeInMargin } from './sources';
import { useQuery } from 'react-query';
import { prettyDate } from '../util';

type CH = { tag: string, time: Date, location?: string };
const SOLEN_PNG_SINCE = new Date(Date.UTC(2015, 12, 12));
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function HolesLinkView() {
	const framesTotal = 3;
	const [frame, setFrame] = useState(0);
	const { cursor: sCursor } = useEventsState();
	const cursor = sCursor?.entity === 'solen_holes' ? sCursor : null;
	const sourceCh = useSource('sources_ch') as CH;
	const sources = useSources();

	useEffect(() => {
		const inte = setInterval(() => {
			setFrame(f => (f + 1) % framesTotal);
		}, 750);
		return () => clearInterval(inte);
	});

	const { id: nodeId, size, isWindow } = useContext(LayoutContext)!;
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
	const cursorCh = cursor ? rowAsDict(data[cursor.row], columns) as CH : sourceCh;

	const isSouth =  cursorCh?.location === 'southern';
	const isNorth =  cursorCh?.location === 'northern';
	const isEquator =  cursorCh?.location === 'trans equatorial';

	const imgSize = Math.min(size.width, size.height - (isWindow ? 0 : 128));
	const clip = isWindow ? 18 : isSouth || isNorth ? 196 : isEquator ? 128 : 48;
	const move = -clip * imgSize / 512 - 2;
	const moveY = isWindow ? move : isNorth ? -18 * imgSize / 512 : isSouth ? -374 * imgSize / 512 : move;

	const rowsHeight = size.height - 28 - imgSize;
	const rowH = devicePixelRatio < 1 ? 24 + (2 / devicePixelRatio) : 25;
	const viewSize = Math.max(0, Math.floor(rowsHeight / rowH));
	const hRem = rowsHeight % rowH;
	const trPadding = hRem > viewSize ? 1 : 0;
	const headerPadding = (hRem - viewSize * trPadding);
	const focusTime = cursorTime && (cursorTime?.getTime() - 2 * 864e5);
	const focusIdx = focusTime == null ? data.length :
		data.findIndex(r => (r[1] as Date)?.getTime() > focusTime);

	const dtTarget = cursor ? cursorCh.time : focusTime == null ? null : new Date(focusTime);
	const dt = dtTarget && new Date(dtTarget?.getTime() + (frame - Math.ceil(framesTotal / 2)) * 864e5);
	const ext = (dt && dt >= SOLEN_PNG_SINCE) ? 'png' : 'jpg';
	const y = dt?.getUTCFullYear(), m = dt?.getUTCMonth(), d = dt?.getUTCDate();
	const imgUrl = dt && `https://solen.info/solar/old_reports/${y}/${months[m!]}/images/` +
		`AR_CH_${y}${(m!+1).toString().padStart(2, '00')}${d!.toString().padStart(2, '00')}.${ext}`;

	return <div>
		{!isWindow && <div style={{ height: rowsHeight + 28 }}>
			{<TableWithCursor {...{
				entity: 'solen_holes', hideBorder: true,
				data, columns, size: { ...size, width: size.width - 3 } , viewSize, focusIdx, onKeydown: e => {
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
					const ch = rowAsDict(row as any, columns) as CH;
					const time = (ch.time as any)?.getTime();
					const linkedToThisCH = equalValues(sourceCh?.tag, ch.tag);
					const linkedToThisFEID = sources.find(s => equalValues(s.ch?.tag, ch.tag));
					
					const orange = !linkedToThisFEID && (feid.s_description as string)?.includes(ch.tag);
					const dark = !orange && !timeInMargin(ch.time, focusTime && new Date(focusTime), 5 * 24 * 36e5, 1 * 36e5);
				
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

		</div>}
		{imgUrl && <div style={{ overflow: 'clip', position: 'relative', userSelect: 'none', height: imgSize }}
			onClick={e => !isWindow && openWindow({ x: e.clientX, y: e.clientY, w: 512, h: 512, params: { type: 'Holes Link View' }, unique: nodeId })}>
			<img alt='' src={imgUrl} draggable={false} style={{
				transform: `translate(${move}px, ${moveY}px)` }}
			width={imgSize * (1 + 2 * clip / 512) - 2}></img>
			<a target='_blank' rel='noreferrer' href={imgUrl} onClick={e => e.stopPropagation()}
				style={{ position: 'absolute', zIndex: 3, top: -2, right: isWindow ? 16 : 2, fontSize: 10,
					color: 'orange', background: 'black', padding: 1 }}>{prettyDate(dt, true)}</a>
			<div style={{ position: 'absolute', zIndex: 3, bottom: 2, right: 2, fontSize: 10,
				color: 'orange', background: 'black', padding: 1 }}>{frame + 1} / {framesTotal}</div>
			<div style={{ position: 'absolute', zIndex: 3, top: -2, left: 2, fontSize: 10,
				color: 'orange', background: 'black', padding: 1 }}>{cursorCh?.tag.slice(2)}</div>
		</div>}
	</div> ;

}