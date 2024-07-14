import { useContext, useEffect, useState, type CSSProperties } from 'react';
import { color, logError, openContextMenu } from '../../app';
import { LayoutContext, openWindow } from '../../layout';
import { TableWithCursor } from './TableView';
import { fetchTable, type ColumnDef, type DataRow } from '../columns';
import { equalValues, valueToString } from '../events';
import { rowAsDict, useEventsState, useFeidCursor, useSource, useSources } from '../eventsState';
import { timeInMargin } from '../sources';
import { useQuery } from 'react-query';
import { apiGet, prettyDate } from '../../util';

type CH = { id: number, area_percent: number, xcen: number, ycen: number };
const URL = 'https://solarmonitor.org/data/';
const columnOrder = ['id', 'lat', 'b', 'phi', 'area_percent', 'width_text'];

export default function ChimeraHoles() {
	const { id: nodeId, size, isWindow } = useContext(LayoutContext)!;
	const margin = 86400;
	const [frame, setFrame] = useState(4);
	const { cursor: sCursor } = useEventsState();
	const { start: cursorTime, row: feid, id: feidId } = useFeidCursor();
	const cursor = sCursor?.entity === 'chimera_holes' ? sCursor : null;
	const sourceCh = useSource('sources_ch') as CH;
	const sources = useSources();

	const focusTime = cursorTime && (cursorTime?.getTime() - 2 * 864e5);
	const start = focusTime == null ? null : focusTime / 1e3 - margin;
	const end = focusTime == null ? null : focusTime / 1e3 + margin;

	const query = useQuery({
		// staleTime: Infinity,
		queryKey: ['chimera_holes', start, end],
		queryFn: async () => {
			if (!start || !end)
				return null;
			const res = await apiGet<{ columns: ColumnDef[], holes: { [dtst: number]: DataRow[] },
				images: number[] }>('events/chimera', { from: start, to: end });

			setFrame(0);
			
			const frames = res.images.filter((tst, i) => tst >= start && tst <= end).map(timestamp => {
				const holesTimestamp = Object.keys(res.holes).map(parseInt).reduce((prev, curr) =>
					Math.abs(curr - timestamp) < Math.abs(prev - timestamp) ? curr : prev);

				const time = new Date(timestamp * 1e3);
				const year = time.getUTCFullYear();
				const mon = (time.getUTCMonth() + 1).toString().padStart(2, '0');
				const day = time.getUTCDate().toString().padStart(2, '0');
				const hour = time.getUTCHours().toString().padStart(2, '0');
				const min = time.getUTCMinutes().toString().padStart(2, '0');
				const sec = time.getUTCSeconds().toString().padStart(2, '0');
				const fname = `${year}${mon}${day}_${hour}${min}${sec}.png`;
				const url = URL + `${year}/${mon}/${day}/pngs/saia/saia_chimr_ch_${fname}`;

				const img = new Image();
				img.src = url;
				const entry = { timestamp, url, img, holesTimestamp, loaded: false };
				img.onload = img.onerror = () => { entry.loaded = true; };
				setTimeout(() => { entry.loaded = true; }, 5000);

				return entry;
			});

			const cols = res.columns.map(col => ({ ...col, width: (() => {switch (col.id) {
				case 'id': return 2.5;
				case 'lat':
				case 'lon': return 4;
				case 'area_percent': return 4.5;
				case 'width_text': return 7.5;
				default: return 5;
			}})() }));
			const reorder = [...new Set([...columnOrder, ...cols.map(c => c.id)])]
				.map(cid => cols.findIndex(col => col.id === cid));
			const columns = reorder.map(idx => cols[idx]);
			const holes = res.holes;
			for (const tst in holes)
				holes[tst] = holes[tst].map(row => reorder.map(idx => row[idx])) as any;

			console.log('chimera => ', holes)
			return { holes, frames, columns };
		},
		onError: (err) => logError(err?.toString())
	});
	const imgSize = Math.min(size.width, size.height - (isWindow ? 0 : 128));

	if (query.isError)
		return <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>;
	if (!query.data)
		return <div className='Center'>LOADING..</div>;

	const { columns, holes, frames } = query.data;
	const { timestamp, url, img, holesTimestamp, loaded } = frames[frame < frames.length ? 1 : 0];
	const data = holes[holesTimestamp];
	const cursorCh = cursor ? rowAsDict(data[cursor.row], columns) as CH : sourceCh;

	const clip = 0;
	const move = 0;
	const targetImgWidth = imgSize * (1 + 430 / 1200) - 2;
	
	const clipX = 264 * imgSize / 1200;
	const clipY = 206 * imgSize / 1200;
	const targetW = 1200, pxPerArcSec = .56;
	const arcSecToPx = (a: number) => a * pxPerArcSec * imgSize / targetW + imgSize / 2;

	const textStyle: CSSProperties = { position: 'absolute', zIndex: 3, fontSize: isWindow ? 16 : 10,
		color: 'orange', background: 'black', padding: '0px 2px' };
	return <div>
		{!isWindow && <div style={{ height: size.height - imgSize, position: 'relative', marginTop: -1 }}>
			{<TableWithCursor {...{
				entity: 'chimera_holes', hideBorder: true, focusIdx: 0,
				data, columns, size: { height: size.height - imgSize, width: size.width - 3 }, onKeydown: e => {
					// if (cursor && ch && e.key === '-')
					// 	return unlinkEruptiveSourceEvent('solen_holes', rowAsDict(data[cursor.row] as any, columns));
					// if (cursor && ['+', '='].includes(e.key))
					// 	return feidId && linkEruptiveSourceEvent('solen_holes', rowAsDict(data[cursor.row] as any, columns), feidId);
				},
				row: (row, idx, onClick, padRow) => {
					const ch = rowAsDict(row as any, columns) as CH;

					const linkedToThisCH = false;
					
					const dark = ch.area_percent < .5;
				
					return <tr key={holesTimestamp+row[0]} style={{ height: 23 + padRow, fontSize: 15 }}>
						{columns.map((column, cidx) => {
							const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
							const value = valueToString(column.id === 'phi' ? row[cidx] / 1e20 : row[cidx]);
							return <td key={column.id} title={`${column.name} = ${value}`}
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
									color: color(linkedToThisCH ? 'cyan' : dark ? 'text-dark' : 'text') }}>
									<div className='TdOver'/>
									{value}
								</span>
							</td>;
						})}
					</tr>;}
			}}/>}

		</div>}
		<div style={{ overflow: 'clip', position: 'relative', userSelect: 'none', height: imgSize }}
			onClick={e => !isWindow && openWindow({ x: e.clientX, y: e.clientY, w: 512, h: 512, params: { type: 'Chimera Holes' }, unique: nodeId })}>
			<div style={{ position: 'absolute', maxWidth: imgSize, maxHeight: imgSize, overflow: 'clip' }}>
				<img alt='' src={url} draggable={false} style={{
					transform: `translate(${-clipX}px, ${-clipY}px)` }}
				width={targetImgWidth}></img>
			</div>
			<a target='_blank' rel='noreferrer' href={url} onClick={e => e.stopPropagation()}
				style={{ ...textStyle, top: 0, right: 0 }}>{prettyDate(timestamp).slice(5, -3)}</a>
			<div style={{ ...textStyle, top: 0, left: 0 }}><b>{prettyDate(holesTimestamp).slice(2, -3)}</b></div>
			{cursorCh && <div style={{ width: 36, height: 36, background: 'rgba(0,0,0,.3)', border: '2px solid orange',
				position: 'absolute', transform: 'translate(-50%, -50%)', color: 'orange', textAlign: 'center',
				left: arcSecToPx(cursorCh.xcen), fontSize: 24, lineHeight: 1.2,
				top: arcSecToPx(-cursorCh.ycen) }}><b>{cursorCh.id}</b></div>}
			{/* <div style={{ position: 'absolute', zIndex: 3, bottom: isWindow ? 6 : 2, right: 0, fontSize: isWindow ? 16 : 10,
				color: 'orange', background: 'black', padding: '0px 2px' }}>{frame + 1} / {framesTotal}</div>
			<div style={{ position: 'absolute', zIndex: 3, top: -2, left: 0, fontSize: isWindow ? 16 : 10,
				color: 'orange', background: 'black', padding: '0px 2px' }}>{cursorCh?.tag.slice(isWindow ? 0 : 2)}</div> */}
		</div>
	</div> ;

}