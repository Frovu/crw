import { useContext, useEffect, useState, type CSSProperties } from 'react';
import { color, openContextMenu } from '../../app';
import { LayoutContext, openWindow } from '../../layout';
import { TableWithCursor } from './TableView';
import { equalValues, valueToString } from '../events';
import { rowAsDict, useEventsState, useFeidCursor, useSource, useSources } from '../eventsState';
import { timeInMargin, useSolenHolesQuery } from '../sources';
import { prettyDate } from '../../util';

type CH = { tag: string, time: Date, location?: string };
const SOLEN_PNG_SINCE = new Date(Date.UTC(2015, 12, 12));
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export default function SolenHoles() {
	const framesTotal = 3;
	const [frame, setFrame] = useState(0);
	const { cursor: sCursor } = useEventsState();
	const { start: cursorTime, row: feid, id: feidId } = useFeidCursor();
	const cursor = sCursor?.entity === 'solen_holes' ? sCursor : null;
	const sourceCh = useSource('sources_ch') as CH;
	const sources = useSources();

	useEffect(() => {
		const inte = setInterval(() => {
			setFrame(f => (f + 1) % framesTotal);
		}, 750);
		return () => clearInterval(inte);
	}, []);

	const { id: nodeId, size, isWindow } = useContext(LayoutContext)!;
	const query = useSolenHolesQuery();

	const imgSize = Math.min(size.width, size.height - (isWindow ? 0 : 128));

	if (!query.data?.data.length)
		return <div className='Center'>LOADING..</div>;

	const { data, columns } = query.data;
	const cursorCh = cursor ? rowAsDict(data[cursor.row], columns) as CH : sourceCh;

	const isSouth =  cursorCh?.location === 'southern';
	const isNorth =  cursorCh?.location === 'northern';
	const isEquator =  cursorCh?.location === 'trans equatorial';

	const clip = isWindow ? 18 : isSouth || isNorth ? 196 : isEquator ? 128 : 48;
	const move = -clip * imgSize / 512 - 2;
	const moveY = isWindow ? move : isNorth ? -18 * imgSize / 512 : isSouth ? -374 * imgSize / 512 : move;

	const focusTime = cursorTime && (cursorTime?.getTime() - 2 * 864e5);
	const focusIdx = focusTime == null ? data.length :
		data.findIndex(r => (r[1] as Date)?.getTime() > focusTime);

	const dtTarget = cursor ? cursorCh.time : focusTime == null ? null : new Date(focusTime);
	const dt = dtTarget && new Date(dtTarget?.getTime() + (frame - Math.ceil(framesTotal / 2)) * 864e5);
	const ext = (dt && dt >= SOLEN_PNG_SINCE) ? 'png' : 'jpg';
	const y = dt?.getUTCFullYear(), m = dt?.getUTCMonth(), d = dt?.getUTCDate();
	const imgUrl = dt && `https://solen.info/solar/old_reports/${y}/${months[m!]}/images/` +
		`AR_CH_${y}${(m!+1).toString().padStart(2, '00')}${d!.toString().padStart(2, '00')}.${ext}`;

	const textStyle: CSSProperties = { position: 'absolute', zIndex: 3, fontSize: isWindow ? 16 : 10,
		color: 'orange', background: 'black', padding: '0px 2px' };
	return <div>
		{!isWindow && <div style={{ height: size.height - imgSize, position: 'relative', marginTop: -1 }}>
			{<TableWithCursor {...{
				entity: 'solen_holes', hideBorder: true,
				data, columns, size: { height: size.height - imgSize, width: size.width - 3 }, focusIdx, onKeydown: e => {
					// if (cursor && ch && e.key === '-')
					// 	return unlinkEruptiveSourceEvent('solen_holes', rowAsDict(data[cursor.row] as any, columns));
					// if (cursor && ['+', '='].includes(e.key))
					// 	return feidId && linkEruptiveSourceEvent('solen_holes', rowAsDict(data[cursor.row] as any, columns), feidId);
				},
				row: (row, idx, onClick, padRow) => {
					const ch = rowAsDict(row as any, columns) as CH;
					const linkedToThisCH = equalValues(sourceCh?.tag, ch.tag);
					const linkedToThisFEID = sources.find(s => equalValues(s.ch?.tag, ch.tag));
					
					const orange = !linkedToThisFEID && (feid.s_description as string)?.includes(ch.tag);
					const dark = !orange && !timeInMargin(ch.time, focusTime && new Date(focusTime), 5 * 24 * 36e5, 1 * 36e5);
				
					return <tr key={row[0]}
						style={{ height: 23 + padRow, fontSize: 15 }}>
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
								<span className='Cell' style={{
									width: column.width + 'ch',
									color: color(linkedToThisCH ? 'cyan' : dark ? 'text-dark' : orange ? 'orange' : 'text') }}>
									<div className='TdOver'/>
									{val}
								</span>
							</td>;
						})}
					</tr>;}
			}}/>}

		</div>}
		{imgUrl && <div style={{ cursor: 'pointer', overflow: 'clip', position: 'relative', userSelect: 'none', height: imgSize }}
			onClick={e => !isWindow && openWindow({ x: e.clientX, y: e.clientY, w: 512, h: 512, params: { type: 'Solen Holes' }, unique: nodeId })}>
			<img alt='' src={imgUrl} draggable={false} style={{
				transform: `translate(${move}px, ${moveY}px)` }}
			width={imgSize * (1 + 2 * clip / 512) - 2}></img>
			<a target='_blank' rel='noreferrer' href={imgUrl} onClick={e => e.stopPropagation()}
				style={{ ...textStyle, bottom: isWindow ? 6 : 1, right: 0 }}>
				≈{prettyDate(new Date(dt.getTime() + 864e5), true)}</a>
			<div style={{ ...textStyle, top: -2, left: 0 }}>{cursorCh?.tag.slice(isWindow ? 0 : 2)}</div>
		</div>}
	</div> ;

}