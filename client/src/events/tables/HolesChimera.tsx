import { useContext, useEffect, useState, type CSSProperties } from 'react';
import { color, logError, openContextMenu, useContextMenu } from '../../app';
import { LayoutContext, openWindow, useNodeExists, type ContextMenuProps } from '../../layout';
import { TableWithCursor } from './TableView';
import { type ColumnDef, type DataRow } from '../columns';
import { equalValues, valueToString } from '../events';
import { rowAsDict, useEventsState, useFeidCursor, useSource } from '../eventsState';
import { linkHoleSourceEvent, unlinkHoleSourceEvent, useHolesViewState, useSolenHolesQuery, type CHS, type ChimeraCH, type SolenCH } from '../sources';
import { useQuery } from 'react-query';
import { apiGet, prettyDate } from '../../util';
import { NumberInput } from '../../Utility';

const URL = 'https://solarmonitor.org/data/';
const columnOrder = ['id', 'lat', 'lon', 'b', 'phi', 'area_percent', 'width_text'];

const defaultSettings = {
	slowFrameTime: 300,
	holesAnimation: true,
};
type Params = Partial<typeof defaultSettings>;

function Menu({ params, setParams }: ContextMenuProps<Partial<Params>>) {
	const para = { ...defaultSettings, ...params };
	const { slowFrameTime: frameTime, holesAnimation } = para;
	const detail = useContextMenu(state => state.menu?.detail) as { ch?: ChimeraCH };
	const { id: feidId } = useFeidCursor();
	const ch = detail?.ch;
	const chs = useSource('sources_ch') as CHS | null;

	const isLinked = ch && chs && equalValues(ch.chimera_time, chs.chimera_time) && equalValues(ch.id, chs.chimera_id);

	return <>
		{ch && <>
			<button className='TextButton' style={{ color: color(chs?.chimera_time ? 'text-dark' : 'text') }}
				onClick={() => feidId && linkHoleSourceEvent('chimera', ch, feidId)}>
				Link CHIMERA CH</button>
			{isLinked && <button className='TextButton'
				onClick={() => unlinkHoleSourceEvent('chimera')}>Unlink CHIMERA CH</button>}
			<div className='separator'/>
		</>}
		<div className=''>Frame time:<NumberInput style={{ width: '4em', margin: '0 2px', padding: 0 }}
			min={20} max={1000} value={frameTime} onChange={val => setParams({ slowFrameTime: val ?? defaultSettings.slowFrameTime })}/></div>
		<label>Animation<input type='checkbox' style={{ paddingLeft: 4 }}
			checked={holesAnimation} onChange={e => setParams({ holesAnimation: e.target.checked })}/></label>
	</>;
}

function Panel() {
	const { id: nodeId, size, isWindow, params } = useContext(LayoutContext)!;
	const { slowFrameTime: frameTime, holesAnimation } = { ...defaultSettings, ...params };
	const { time: stateTime, catched, setTime, setCatched } = useHolesViewState();
	const [frame, setFrame] = useState(4);
	const { cursor: sCursor, setCursor } = useEventsState();
	const { start: cursorTime, id: feidId } = useFeidCursor();
	const cursor = sCursor?.entity === 'chimera_holes' ? sCursor : null;
	const solenCursor = sCursor?.entity === 'solen_holes' ? sCursor : null;
	const sourceCh = useSource('sources_ch') as CHS;
	const solenQuery = useSolenHolesQuery();
	const isSlave = useNodeExists('Chimera Holes') && isWindow;

	const solenChOfSrc = (sourceCh?.tag && solenQuery.data
		&& solenQuery.data.data.find(r => r[0] === sourceCh.tag)) || null;
	const solenHole = catched?.solenHole
		?? (solenChOfSrc && rowAsDict(solenChOfSrc, solenQuery.data!.columns) as SolenCH)
		?? (solenCursor && solenQuery.data &&
			rowAsDict(solenQuery.data.data[solenCursor.row], solenQuery.data.columns)) as SolenCH | null ?? null;
	const solenTime = solenHole?.time as Date | null;

	const focusTime = solenTime ? solenTime.getTime() : (cursorTime && (cursorTime?.getTime() - 2 * 864e5));
	const start = catched?.start ?? (focusTime == null ? null : Math.floor(focusTime / 864e5) * 86400 - 86400 * 5 / 4);
	const end = catched?.end ?? (focusTime == null ? null : Math.ceil(focusTime / 864e5) * 86400 + 86400 * 5 / 4);

	const query = useQuery({
		queryKey: ['chimera_holes', start, end, holesAnimation],
		queryFn: async () => {
			if (!start || !end)
				return null;
			const res = await apiGet<{ columns: ColumnDef[], holes: { [dtst: number]: DataRow[] },
				images: number[] }>('events/chimera', { from: start, to: end });

			const frames = res.images.filter((tst) => tst >= start && tst <= end).map(timestamp => {
				const holesTimestamp = Object.keys(res.holes).map(a => parseInt(a)).reduce((prev, curr) =>
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

				const entry = { timestamp, url, holesTimestamp, loaded: false, img: null as null | HTMLImageElement };
				if (holesAnimation || holesTimestamp === timestamp) {
					const img = entry.img = new Image();
					img.src = url;
					img.onload = img.onerror = () => { entry.loaded = true; };
					setTimeout(() => { entry.loaded = true; }, 5000);
				}

				return entry;
			});

			const cols = res.columns.map(col => ({ ...col, width: (() => {switch (col.id) {
				case 'id': return 2.5;
				case 'lat':
				case 'lon': return 3.5;
				case 'area_percent': return 4.5;
				case 'width_text': return 7.5;
				default: return 4.5;
			}})() })).concat({ id: 'chimera_time', hidden: true, type: 'time' } as ColumnDef);
			const reorder = [...new Set([...columnOrder, ...cols.map(c => c.id)])]
				.map(cid => cols.findIndex(col => col.id === cid));
			const columns = reorder.map(idx => cols[idx]);
			const holes = res.holes;
			for (const tst in holes) {
				if (parseInt(tst) < start || parseInt(tst) > end) {
					delete holes[tst];
					continue;
				}
				holes[tst] = holes[tst].map(row =>
					[...reorder.slice(0, -1).map(idx => row[idx]), new Date(parseInt(tst) * 1e3)]) as any;
			}
			console.log('chimera => ', holes);
			return { holes, frames, columns };
		},
		onError: (err) => logError(err?.toString())
	});

	const framesTotal = query.data?.frames.length ?? 1;

	useEffect(() => {
		const tst = query.data?.frames[frame]?.timestamp;
		if (!tst || isSlave) return;
		setTime(tst);
	}, [frame, isSlave, query.data?.frames, setTime]);

	useEffect(() => {
		if (!isSlave) return;
		const fr = query.data?.frames.findIndex(f => f.timestamp === stateTime) ?? 0;
		setFrame(fr >= 0 ? fr : 0);
	}, [isSlave, query.data?.frames, stateTime, holesAnimation]);

	useEffect(() => {
		if (isSlave) return;
		if (!holesAnimation && focusTime && query.data?.frames) {
			const fr = query.data?.frames.findIndex(f => f.timestamp >= focusTime / 1e3) ?? 0;
			const { holesTimestamp } = query.data?.frames[fr];
			const fra = query.data?.frames.findIndex(f => f.timestamp === holesTimestamp) ?? 0;
			setFrame(fra >= 0 ? fra : 0);
			return;
		}
		const inte = setInterval(() => {
			if (!catched)
				setFrame(f => (f + 1) % framesTotal);
		}, frameTime);
		return () => clearInterval(inte);
	}, [frameTime, catched, framesTotal, isSlave, holesAnimation, query.data?.frames, focusTime]);

	useEffect(() => {
		if (!cursor)
			setCatched(null);
	}, [cursor, setCatched]);

	if (query.isError)
		return <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>;
	if (!query.data)
		return <div className='Center'>LOADING..</div>;

	const { columns, holes, frames } = query.data;
	const { timestamp, url, holesTimestamp } = frames[frame < frames.length ? frame : 0];
	const data = holes[holesTimestamp] ?? [];
	const cursorCh = cursor ? rowAsDict(data[cursor.row], columns) as ChimeraCH : null;

	const imgSize = Math.min(size.width, size.height - (isWindow ? 0 : 104));
	const targetImgWidth = imgSize * (1 + 430 / 1200) - 2;
	
	const clipX = 264 * imgSize / 1200;
	const clipY = 206 * imgSize / 1200;
	const targetW = 1200, pxPerArcSec = .56;
	const arcSecToPx = (a: number) => a * pxPerArcSec * imgSize / targetW + imgSize / 2;

	const cycleHoles = (dir: 1 | -1) => {
		const tsts = Object.keys(holes).map(a => parseInt(a));
		const idx = tsts.indexOf(holesTimestamp);
		const newHoles = tsts[(idx + dir + tsts.length) % tsts.length];
		setFrame(frames.findIndex(f => f.timestamp === newHoles));
		setTime(newHoles);
		setTimeout(() => {
			console.log('set', cursor, start, end);
			setCatched(catched);
			setCursor(cursor);
		}, 10);
	};

	const textStyle: CSSProperties = { position: 'absolute', zIndex: 3, fontSize: isWindow ? 16 : 10,
		color: 'orange', background: 'black', padding: '0px 2px' };
	return <div>
		{!isWindow && <div style={{ height: size.height - imgSize, position: 'relative', marginTop: -1 }}>
			{<TableWithCursor {...{
				entity: 'chimera_holes', hideBorder: true, focusIdx: 0,
				data, columns, size: { height: size.height - imgSize, width: size.width - 3 }, onKeydown: e => {
					const cycle = e.altKey && { 'ArrowLeft': -1, 'ArrowRight': 1 }[e.code];
					if (cycle)
						cycleHoles(cycle as any);
					if (cursor && cursorCh && ['+', '='].includes(e.key))
						return feidId && linkHoleSourceEvent('chimera', cursorCh, feidId);
					if (cursor && e.key === '-')
						return unlinkHoleSourceEvent('chimera');
				},
				row: (row, idx, onClick, padRow) => {
					const ch = rowAsDict(row as any, columns) as ChimeraCH;

					const linkedToThisCH = false;
					
					const dark = ch.area_percent < .4
						|| (solenHole?.location === 'northern' && ch.lat <= 10)
						|| (solenHole?.location === 'southern' && ch.lat >= -10);
				
					return <tr key={holesTimestamp+row[0]} style={{ height: 23 + padRow, fontSize: 15 }}>
						{columns.map((column, cidx) => {
							const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
							const value = valueToString(row[cidx]);
							return <td key={column.id} title={`${column.name} = ${value}`}
								onClick={e => {
									if (start && end)
										setCatched({ start, end, solenHole });
									setFrame(query.data?.frames.findIndex(f => f.timestamp === holesTimestamp) ?? 0);
							
									if (cidx === 0 && feidId !== null)
										return linkHoleSourceEvent('chimera', ch, feidId);
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
					</tr>;} }}/>}
		</div>}
		<div style={{ cursor: 'pointer', overflow: 'clip', position: 'relative', userSelect: 'none', height: imgSize }}
			onClick={e => !isWindow && openWindow({ x: e.clientX, y: e.clientY, w: 512, h: 512, params: { type: 'Chimera Holes' }, unique: nodeId })}>
			<div style={{ position: 'absolute', maxWidth: imgSize, maxHeight: imgSize, overflow: 'clip' }}>
				<img alt='' src={url} draggable={false} style={{
					transform: `translate(${-clipX}px, ${-clipY}px)` }}
				width={targetImgWidth}></img>
			</div>
			<div style={{ ...textStyle, bottom: isWindow ? 6 : 0, right: 0 }}>
				<span style={{ paddingRight: 8 }}>{frame+1}/{framesTotal}</span>
				<a target='_blank' rel='noreferrer' href={url} style={{ color: 'orange' }} onClick={e => e.stopPropagation()}>
					{prettyDate(timestamp).slice(5, -3)}</a>
			</div>
			{!isWindow && <div style={{ ...textStyle, top: 0, left: 0 }}><b>^{prettyDate(holesTimestamp).slice(0, -3)}</b></div>}
			{!isWindow && catched && <div style={{ ...textStyle, top: -4, right: 0, fontSize: 18, padding: '0 4px' }}
				title='Hint: use alt + arrows' onClick={e => e.stopPropagation()}>
				<button className='TextButton' style={{ lineHeight: 1, padding: 2 }}
					onClick={() => cycleHoles(-1)}><b>&lt;</b></button>
				<button className='TextButton' style={{ lineHeight: 1, padding: 2 }}
					onClick={() => cycleHoles(1)}><b>&gt;</b></button></div>}
			{cursorCh && <div style={{ width: 36, height: 36, background: 'rgba(0,0,0,.3)', border: '2px solid orange',
				position: 'absolute', transform: 'translate(-50%, -50%)', color: 'orange', textAlign: 'center',
				left: arcSecToPx(cursorCh.xcen), fontSize: 24, lineHeight: 1.2,
				top: arcSecToPx(-cursorCh.ycen) }}><b>{cursorCh.id}</b></div>}
		</div>
	</div> ;
}

export const ChimeraHoles = {
	name: 'Chimera Holes',
	Panel,
	Menu
};