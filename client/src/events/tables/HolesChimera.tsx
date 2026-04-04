import { useContext, useEffect, useState, type CSSProperties } from 'react';
import { color, useContextMenuStore, useEventsContextMenu } from '../../app/app';
import { LayoutContext, openWindow, useNodeExists, type ContextMenuProps } from '../../app/layout';
import { EventsTable } from './Table';
import { type DataRow } from '../columns/columns';
import { equalValues, valueToString } from '../core/util';
import { useEntityCursor, useEventsState, useFeidCursor, useSelectedSource } from '../core/eventsState';
import { linkHoleSourceEvent, unlinkHoleSourceEvent, useHolesViewState, type ChimeraCH } from '../core/sourceActions';
import { useQuery } from '@tanstack/react-query';
import { apiGet, cn, prettyDate } from '../../util';
import { NumberInput } from '../../components/Input';
import { Button } from '../../components/Button';
import { useTableDataQuery } from '../core/query';
import { tableRowAsDict, type TableValue } from '../core/editableTables';
import type { StaticColumn } from '../../api';

const URL = 'https://solarmonitor.org/data/';
const columnOrder = ['id', 'lat', 'lon', 'b', 'phi', 'area_percent', 'width_text'];

const defaultSettings = {
	slowFrameTime: 300,
	holesAnimation: true,
};
type Params = Partial<typeof defaultSettings>;

function Menu({ params, setParams, Checkbox }: ContextMenuProps<Partial<Params>>) {
	const { slowFrameTime: frameTime, holesAnimation } = { ...defaultSettings, ...params };
	const menu = useEventsContextMenu<'chimera_holes'>();
	const { id: feidId } = useFeidCursor();
	const ch = menu?.event as ChimeraCH;
	const chs = useSelectedSource('sources_ch');

	const isLinked = ch && chs && equalValues(ch.chimera_time, chs.chimera_time) && equalValues(ch.id, chs.chimera_id);

	return (
		<>
			{ch && (
				<>
					<Button
						className={cn(chs?.chimera_time && 'text-dark')}
						onClick={() => feidId && linkHoleSourceEvent('chimera_holes', ch, feidId)}
					>
						Link CHIMERA CH
					</Button>
					{isLinked && <Button onClick={() => unlinkHoleSourceEvent('chimera_holes')}>Unlink CHIMERA CH</Button>}
					<div className="separator" />
				</>
			)}
			<div>
				Frame time:
				<NumberInput
					className="w-16 ml-1"
					min={20}
					max={1000}
					value={frameTime}
					onChange={(val) => setParams({ slowFrameTime: val ?? defaultSettings.slowFrameTime })}
				/>
			</div>
			<Checkbox label="Animation" k="holesAnimation" />
		</>
	);
}

function Panel() {
	const { id: nodeId, size, isWindow, params } = useContext(LayoutContext)!;
	const { slowFrameTime: frameTime, holesAnimation } = { ...defaultSettings, ...params };
	const { time: stateTime, catched, setTime, setCatched } = useHolesViewState();
	const [frame, setFrame] = useState(1);
	const { setCursor } = useEventsState();
	const { start: cursorTime, id: feidId } = useFeidCursor();
	const cursor = useEntityCursor('chimera_holes');
	const solenCursor = useEntityCursor('solen_holes');
	const sourceCh = useSelectedSource('sources_ch');
	const solenQuery = useTableDataQuery('solen_holes');
	const isSlave = useNodeExists('Chimera Holes') && isWindow;

	const solenEntry = (row: TableValue[]) => tableRowAsDict<'solen_holes'>(row, solenQuery.data!.columns);

	const solenChOfSrc =
		(sourceCh?.tag && solenQuery.data && solenQuery.data.data.find((r) => equalValues(r[0], sourceCh.tag))) || null;
	const solenHole =
		catched?.solenHole ??
		(solenChOfSrc && solenEntry(solenChOfSrc)) ??
		(solenCursor && solenQuery.data && solenEntry(solenQuery.data.data[solenCursor.row])) ??
		null;
	const solenTime = solenHole?.time as Date | null;

	const focusTime = solenTime ? solenTime.getTime() : cursorTime && cursorTime?.getTime() - 2 * 864e5;
	const start = catched?.start ?? (focusTime == null ? null : Math.floor(focusTime / 864e5) * 86400 - (86400 * 5) / 4);
	const end = catched?.end ?? (focusTime == null ? null : Math.ceil(focusTime / 864e5) * 86400 + (86400 * 5) / 4);

	const query = useQuery({
		queryKey: ['chimera_holes', start, end, holesAnimation],
		queryFn: async () => {
			if (!start || !end) return null;
			type CHMResp = { columns: StaticColumn[]; holes: { [dtst: number]: DataRow[] }; images: number[] };
			const res = await apiGet<CHMResp>('events/chimera', {
				from: start,
				to: end,
			});

			const frames = res.images
				.filter((tst) => tst >= start && tst <= end)
				.map((timestamp) => {
					const holesTimestamp = Object.keys(res.holes)
						.map((a) => parseInt(a))
						.reduce((prev, curr) => (Math.abs(curr - timestamp) < Math.abs(prev - timestamp) ? curr : prev));

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
						const img = (entry.img = new Image());
						img.src = url;
						img.onload = img.onerror = () => {
							entry.loaded = true;
						};
						setTimeout(() => {
							entry.loaded = true;
						}, 5000);
					}

					return entry;
				});

			const cols = res.columns.concat({ sql_name: 'chimera_time', hidden: true, type: 'time' } as any as StaticColumn);
			const reorder = [...new Set([...columnOrder, ...cols.map((c) => c.sql_name)])].map((name) =>
				cols.findIndex((col) => col.sql_name === name),
			);
			const columns = reorder.map((idx) => cols[idx]);
			const holes = res.holes;
			for (const tst in holes) {
				if (parseInt(tst) < start || parseInt(tst) > end) {
					delete holes[tst];
					continue;
				}
				holes[tst] = holes[tst].map((row) => [
					...reorder.slice(0, -1).map((idx) => row[idx]),
					new Date(parseInt(tst) * 1e3),
				]) as any;
			}
			console.log('chimera => ', holes);
			return { holes, frames, columns };
		},
	});

	const framesTotal = query.data?.frames.length ?? 0;

	useEffect(() => {
		const tst = query.data?.frames[frame]?.timestamp;
		if (!tst || isSlave) return;
		setTime(tst);
	}, [frame, isSlave, query.data?.frames, setTime]);

	useEffect(() => {
		if (!isSlave) return;
		const fr = query.data?.frames.findIndex((f) => f.timestamp === stateTime) ?? 0;
		setFrame(fr >= 0 ? fr : 0);
	}, [isSlave, query.data?.frames, stateTime, holesAnimation]);

	useEffect(() => {
		if (isSlave) return;
		if (!holesAnimation && focusTime && query.data?.frames) {
			const fr = query.data?.frames.findIndex((f) => f.timestamp >= focusTime / 1e3) ?? 0;
			const { holesTimestamp } = query.data?.frames[fr];
			const fra = query.data?.frames.findIndex((f) => f.timestamp === holesTimestamp) ?? 0;
			setFrame(fra >= 0 ? fra : 0);
			return;
		}
		const inte = setInterval(() => {
			if (!catched) setFrame((f) => (framesTotal ? (f + 1) % framesTotal : 0));
		}, frameTime);
		return () => clearInterval(inte);
	}, [frameTime, catched, framesTotal, isSlave, holesAnimation, query.data?.frames, focusTime]);

	useEffect(() => {
		if (!cursor) setCatched(null);
	}, [cursor, setCatched]);

	if (query.isError)
		return (
			<div title={query.error.message} className="center text-red">
				FAILED TO LOAD
			</div>
		);
	if (!query.data) return <div className="center">LOADING..</div>;
	if (framesTotal <= 0) return <div className="center">NO CHIMERA DATA</div>;

	const { columns, holes, frames } = query.data;
	const { timestamp, url, holesTimestamp } = frames[frame < frames.length ? frame : 0];
	const data = holes[holesTimestamp] ?? [];
	const cursorCh = cursor ? tableRowAsDict<'chimera_holes'>(data[cursor.row], columns) : null;

	const imgSize = Math.min(size.width, size.height - (isWindow ? 0 : 104));
	const targetImgWidth = imgSize * (1 + 430 / 1200) - 4;

	const clipX = (264 * imgSize) / 1200;
	const clipY = (206 * imgSize) / 1200;
	const targetW = 1200,
		pxPerArcSec = 0.56;
	const arcSecToPx = (a: number) => (a * pxPerArcSec * imgSize) / targetW + imgSize / 2;

	const cycleHoles = (dir: 1 | -1) => {
		const tsts = Object.keys(holes).map((a) => parseInt(a));
		const idx = tsts.indexOf(holesTimestamp);
		const newHoles = tsts[(idx + dir + tsts.length) % tsts.length];
		setFrame(frames.findIndex((f) => f.timestamp === newHoles));
		setTime(newHoles);
		setTimeout(() => {
			setCatched(catched);
			setCursor(cursor);
		}, 10);
	};

	const textCn = 'absolute z-3 !text-orange-400 bg-black px-1';

	return (
		<div>
			{!isWindow && (
				<div className="relative -mt-[1px] -ml-[1px]" style={{ height: size.height - imgSize }}>
					<EventsTable
						{...{
							entity: 'chimera_holes',
							hideBorder: true,
							focusIdx: 1,
							data,
							columns,
							sliceCols: 0,
							size: { height: size.height - imgSize, width: size.width - 3 },
							onKeydown: (e) => {
								const cycle = e.altKey && { ',': -1, '.': 1 }[e.code];
								if (cycle) cycleHoles(cycle as any);
								if (cursor && cursorCh && ['+', '='].includes(e.key))
									return feidId && linkHoleSourceEvent('chimera_holes', cursorCh, feidId);
								if (cursor && e.key === '-') return unlinkHoleSourceEvent('chimera_holes');
							},
							onClick: (e, row, column) => {
								console.log(start, end, solenHole);
								if (start && end) setCatched({ start, end, solenHole });
								setFrame(query.data?.frames.findIndex((f) => f.timestamp === holesTimestamp) ?? 0);

								if (column.name === 'id' && feidId !== null) {
									const ch = tableRowAsDict(row, columns) as ChimeraCH;
									linkHoleSourceEvent('chimera_holes', ch, feidId);
									return true;
								}
							},
							rowClassName: (row) => {
								const ch = tableRowAsDict(row, columns) as ChimeraCH;
								const linkedToThisCH =
									equalValues(sourceCh?.chimera_id, ch.id) &&
									equalValues(sourceCh?.chimera_time, ch.chimera_time);
								if (linkedToThisCH) return 'text-cyan';

								const dark =
									(ch.area_percent ?? 0) < 0.4 ||
									(solenHole?.location === 'northern' && (ch.lat ?? 0) <= 10) ||
									(solenHole?.location === 'southern' && (ch.lat ?? 0) >= -10);

								if (dark) return 'text-dark';
							},
						}}
					/>
				</div>
			)}
			<div
				className="cursor-pointer overflow-clip relative select-none"
				style={{ height: imgSize }}
				onClick={(e) =>
					!isWindow &&
					openWindow({
						x: e.clientX,
						y: e.clientY,
						w: 512,
						h: 512,
						params: { type: 'Chimera Holes' },
						unique: nodeId,
					})
				}
			>
				<div className="absolute overflow-clip" style={{ maxWidth: imgSize, maxHeight: imgSize }}>
					<img
						alt=""
						src={url}
						draggable={false}
						style={{
							maxWidth: targetImgWidth,
							transform: `translate(${-clipX}px, ${-clipY}px)`,
						}}
					></img>
				</div>
				<div className={cn(textCn, isWindow ? 'bottom-1 text-lg' : 'bottom-0 text-xs', 'right-0')}>
					<span>
						{frame + 1}/{framesTotal}
					</span>
					<a
						className="pl-2 !text-orange-400"
						target="_blank"
						rel="noreferrer"
						href={url}
						onClick={(e) => e.stopPropagation()}
					>
						{prettyDate(timestamp).slice(5, -3)}
					</a>
				</div>
				{!isWindow && (
					<div className={cn(textCn, 'top-0 left-0', isWindow ? 'text-lg' : 'text-xs')}>
						<b>^{prettyDate(holesTimestamp).slice(0, -3)}</b>
					</div>
				)}
				{!isWindow && catched && (
					<div
						className={cn(textCn, 'top-0 right-0 flex')}
						title="Hint: use Alt + < and Alt + >"
						onClick={(e) => e.stopPropagation()}
					>
						<Button className="pl-2" onClick={() => cycleHoles(-1)}>
							<b>&lt;</b>
						</Button>
						<Button className="px-1" onClick={() => cycleHoles(1)}>
							<b>&gt;</b>
						</Button>
					</div>
				)}
				{cursorCh && (
					<div
						style={{
							width: 36,
							height: 36,
							background: 'rgba(0,0,0,.3)',
							border: '2px solid orange',
							position: 'absolute',
							transform: 'translate(-50%, -50%)',
							color: 'orange',
							textAlign: 'center',
							left: arcSecToPx(cursorCh.xcen ?? 0),
							fontSize: 24,
							lineHeight: 1.2,
							top: arcSecToPx(-(cursorCh.ycen ?? 0)),
						}}
					>
						<b>{cursorCh.id}</b>
					</div>
				)}
			</div>
		</div>
	);
}

export const ChimeraHoles = {
	name: 'Chimera Holes',
	Panel,
	Menu,
};
