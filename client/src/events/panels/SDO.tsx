import { useQuery } from '@tanstack/react-query';
import { useContext, useRef, useState, useEffect, useMemo, type MouseEvent } from 'react';
import { type ContextMenuProps, LayoutContext, type LayoutContextType, openWindow } from '../../layout';
import { font } from '../../plots/plotUtil';
import { apiGet, dispatchCustomEvent, prettyDate } from '../../util';
import { getSourceLink, serializeCoords } from '../core/sourceActions';
import { equalValues, type EventsPanel } from '../core/util';
import { useEventsState, useFeidCursor, useSelectedSource } from '../core/eventsState';
import { useCompoundTable } from '../core/query';
import { color } from '../../app';
import { create } from 'zustand';
import { NumberInput } from '../../components/NumberInput';
import { SimpleSelect } from '../../components/Select';

const T_BEFORE = 4 * 3600;
const T_AFTER = 6 * 3600;

const IMG_URL = 'https://cdaw.gsfc.nasa.gov/images/';

const SDO_SRC = [
	'AIA 193',
	'AIA 193 diff',
	'LASCO C2',
	'LASCO C3',
	'AIA 094',
	'AIA 131',
	'AIA 171',
	'AIA 211',
	'AIA 304',
	'AIA 335',
] as const;

const defaultParams = {
	src: 'AIA 193' as (typeof SDO_SRC)[number],
	frameTime: 40,
	cadence: 4,
	slave: false,
};
type Params = typeof defaultParams;

export const useSunViewState = create<{
	time: number;
	setTime: (a: number) => void;
}>()((set) => ({
	time: 0,
	setTime: (time) => set((s) => ({ ...s, time })),
}));

function computeSolarNumbers(time: number, size: number) {
	const doy = ((time * 1000 - Date.UTC(new Date(time).getUTCFullYear(), 0, 0)) / 864e5) % 365.256;
	const aphDoy = 186;
	const ascDoy = 356;

	const scl = size / 512;
	const x0 = 256.5 * scl;
	const y0 = 243.5 * scl;
	const dist = 1 - (2 * Math.abs(aphDoy - doy)) / 365.256;
	const rs = (205 - dist * 7) * scl;

	const decl = 7.155 * Math.sin(((doy - ascDoy) / 365.256) * 2 * Math.PI);

	return { x0, y0, rs, decl };
}

export function useSunViewParams() {
	const flares = useCompoundTable('flare');
	const cmes = useCompoundTable('cme');
	const cursor = useEventsState((st) => st.cursor);
	const erupt = useSelectedSource('sources_erupt', true);
	const { start: feidTime } = useFeidCursor();

	return useMemo(() => {
		const cme = (() => {
			if (!cmes) return null;
			if (cursor?.entity === 'cme') return cmes.entry(cmes.data[cursor.row]);
			if (!erupt) return null;
			const link = getSourceLink('cme', 'LSC');
			const idColIdx = cmes.index[link.id]!;
			const found = cmes.data.find((row) => row[0] === 'LSC' && equalValues(row[idColIdx], erupt[link.link]));
			return found ? cmes.entry(found) : null;
		})();

		if (flares && cursor?.entity === 'flare') {
			const { start_time: time, lat, lon, src, class: ent } = flares.entry(flares.data[cursor.row]);
			return { time, lat, lon, src, ent };
		}

		if (cme) {
			const { time, lat, lon, src } = cme;
			const angle = cme.central_angle ?? cme.measurement_angle;
			return { time, lat, lon, src, ent: 'CME', angle, width: cme.angular_width };
		}

		if (erupt) {
			const { cme_time, flr_start, lat, lon, coords_source } = erupt;
			const time = flr_start ?? cme_time!;
			return { time, lat, lon, ent: coords_source };
		}

		return {
			time: feidTime,
		};
	}, [cmes, cursor, erupt, feidTime, flares]);
}

export function Panel() {
	const { size: nodeSize, params, isWindow, id: nodeId } = useContext(LayoutContext)! as LayoutContextType<Params>;
	const { src: source, slave, frameTime, cadence } = params;
	const { time: masterTime, setTime } = useSunViewState();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const size = Math.min(nodeSize.width, nodeSize.height);
	const [frame, setFrame] = useState(0);

	const { time: date, lat, lon, src, ent, width, angle } = useSunViewParams();

	const isLsc = source.startsWith('LASCO');
	const refTime = date.getTime() / 1000;
	const start = refTime - T_BEFORE;
	const end = refTime + T_AFTER;

	const query = useQuery({
		staleTime: Infinity,
		queryKey: ['sdo', source, start, end, cadence],
		queryFn: async () => {
			if (!start || !end) return [];
			const res = await apiGet<{ timestamps: number[] }>('events/sun_images', { from: start, to: end, source });

			setFrame(0);

			return res.timestamps
				.filter((tst, i) => i % cadence === 0 && tst >= start && tst <= end)
				.map((timestamp) => {
					const dir = isLsc
						? 'soho/lasco'
						: (source.endsWith('diff') ? 'sdo/aia_synoptic_rdf/' : 'sdo/aia_synoptic_nrt/') + source.split(' ')[1];
					const time = new Date(timestamp * 1000);
					const year = time.getUTCFullYear();
					const mon = (time.getUTCMonth() + 1).toString().padStart(2, '0');
					const day = time.getUTCDate().toString().padStart(2, '0');
					const hour = time.getUTCHours().toString().padStart(2, '0');
					const min = time.getUTCMinutes().toString().padStart(2, '0');
					const sec = time.getUTCSeconds().toString().padStart(2, '0');
					const fname =
						`${year}${mon}${day}_${hour}${min}${sec}_` +
						(isLsc
							? `lasc${source.at(-1)}rdf.png`
							: `sdo_a${source.split(' ')[1]}${source.endsWith('diff') ? 'rdf' : ''}.jpg`);
					const url = IMG_URL + `${dir}/${year}/${mon}/${day}/${fname}`;

					const img = new Image();
					img.src = url;
					const entry = { timestamp, url, img, loaded: false };
					img.onload = img.onerror = () => {
						entry.loaded = true;
					};
					setTimeout(() => {
						entry.loaded = true;
					}, 5000);

					return entry;
				});
		},
	});

	useEffect(() => {
		if (!query.data || slave) return;
		const inter = setInterval(() => {
			if (frame >= query.data.length) return setFrame(0);
			setTime(query.data[frame].timestamp);
			setFrame((f) => (f + 1 >= query.data.length ? 0 : f + 1));
		}, frameTime);
		return () => clearInterval(inter);
	}, [frame, frameTime, query.data, setTime, slave]);

	useEffect(() => {
		if (!query.data || !slave) return;
		const foundIdx = query.data.findIndex((e) => e.timestamp > masterTime);
		if (foundIdx < 0) setFrame(0);
		else setFrame(foundIdx);
	}, [masterTime, query.data, slave]);

	useEffect(() => {
		const time = query.data?.[frame]?.timestamp;
		if (!canvasRef.current) return;
		const { PI, sin, cos } = Math;
		const canvas = canvasRef.current;
		canvas.width = canvas.height = size;
		const ctx = canvasRef.current.getContext('2d')!;
		ctx.clearRect(0, 0, size, size);

		if (time && angle != null && width != null) {
			ctx.lineWidth = 1.5;
			ctx.font = font(10);

			ctx.strokeStyle = color('green', time < refTime ? 0.5 : 1);
			ctx.fillStyle = 'white';
			const scl = size / 512;
			const x0 = 256.5 * scl;
			const y0 = 243.5 * scl;
			const rs = (source.includes('C3') ? 35 : 90) * scl;
			const rview = (source.includes('C3') ? 265 : 400) * scl;
			const angle0 = 270 - angle - width / 2;
			const angle1 = 270 - angle + width / 2;
			ctx.arc(x0, y0, rs, (angle0 / 180) * PI, (angle1 / 180) * PI);
			ctx.stroke();
			ctx.beginPath();

			const a0 = angle;
			const a1 = angle - width / 2;
			const a2 = angle + width / 2;

			const lines = width === 360 ? [a0] : [a1, a2];

			for (const ang of lines) {
				const xr = x0 + rs * sin(PI + (ang / 180) * PI);
				const yr = y0 + rs * cos(PI + (ang / 180) * PI);
				const xb = x0 + rview * sin(PI + (ang / 180) * PI);
				const yb = y0 + rview * cos(PI + (ang / 180) * PI);
				ctx.moveTo(xr, yr);
				ctx.lineTo(xb, yb);
			}

			ctx.fillText(`width=${width}`, 4, 12);
			ctx.fillText(`angle=${angle}`, 4, 26);
			ctx.stroke();
		}

		if (!time || isLsc) return;
		ctx.lineWidth = 1.5;
		ctx.font = font(10);
		ctx.setLineDash([8, 18]);
		ctx.strokeStyle = color('green');
		ctx.fillStyle = 'white';
		const { x0, y0, rs, decl } = computeSolarNumbers(time, size);
		ctx.arc(x0, y0, rs, 0, 2 * PI);
		ctx.stroke();
		ctx.beginPath();
		if (!lon || Math.abs(lon) < 90) ctx.setLineDash(Math.abs(time - refTime) < 1500 ? [6, 6] : []);

		if (lat != null && lon != null) {
			const sunRotation = 360 / 27.27 / 86400; // kinda
			const rot = (time - refTime) * sunRotation;
			const flat = lat + decl;
			const flon = lon + rot;
			const x = x0 + rs * sin((flon / 180) * PI) * cos((flat / 180) * PI);
			const y = y0 + rs * -sin((flat / 180) * PI);
			ctx.arc(x, y, 20, 0, 2 * PI);
			ctx.fillText(`incl=${decl.toFixed(2)}`, 4, 12);
		}
		ctx.stroke();
	}, [frame, size, query.data, lat, lon, refTime, isLsc, angle, width, source]);

	const isLoaded = query.data && query.data.length > 0;

	const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
		if (!e.ctrlKey && !isWindow) {
			return openWindow({
				x: e.clientX - 256,
				y: e.clientY - 256,
				w: 512,
				h: 516,
				params: { ...params, slave: true } as any,
				unique: nodeId,
			});
		}
		const time = query.data?.[frame]?.timestamp;
		if (!e.ctrlKey || !time) return;
		const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
		const { x0, y0, rs, decl } = computeSolarNumbers(time, size);
		const { cos, asin, round, PI } = Math;
		const x = x0 - (e.clientX - rect.x);
		const y = y0 - (e.clientY - rect.y);
		const xr = x / rs;
		const yr = y / rs;
		const nlat = (asin(yr) * 180) / PI - decl;
		const nlon = (-asin(xr / cos((nlat / 180) * PI)) * 180) / PI;

		dispatchCustomEvent('setSolarCoordinates', {
			time: new Date(round(time - 3000) * 1e3),
			lat: round(nlat),
			lon: round(nlon),
		});
	};

	return (
		<div>
			{query.isLoading && <div className="center">LOADING..</div>}
			{query.isError && (
				<div className="center" style={{ color: color('red') }}>
					FAILED TO LOAD
				</div>
			)}
			{!isLoaded && query.isSuccess && <div className="center">NO SDO DATA</div>}
			{!isLsc && isLoaded && (
				<div
					style={{
						position: 'absolute',
						zIndex: 2,
						color: 'white',
						top: size - (size * 18) / 512 - 58,
						left: 4,
						fontSize: 12,
						lineHeight: 1.1,
					}}
				>
					<b>
						{src ?? ''}
						<br />
						{ent ?? ''}
						<br />
						{lat != null && lon != null && serializeCoords({ lat, lon })}
					</b>
					<br />
					{prettyDate(refTime)}
				</div>
			)}
			{isLoaded && (
				<div style={{ position: 'absolute', color: 'white', top: isLsc ? 0 : size - 18, right: 6, fontSize: 12 }}>
					{frame} / {query.data.length}
				</div>
			)}
			<canvas ref={canvasRef} style={{ position: 'absolute', cursor: 'pointer', zIndex: 3 }} onClick={onClick} />
			{isLoaded && <img alt="" src={query.data[frame]?.url} width={size}></img>}
		</div>
	);
}

function Menu({ params, setParams, Checkbox }: ContextMenuProps<Params>) {
	const para = { ...defaultParams, ...params };
	const { src, frameTime, cadence } = para;
	return (
		<>
			<div className="flex gap-1 items-center pr-0.5">
				Src:
				<SimpleSelect
					className="bg-input-bg"
					value={src}
					onChange={(val) => setParams({ src: val })}
					options={SDO_SRC.map((s) => [s, s])}
				/>
			</div>
			<div>
				Frame time:
				<NumberInput
					style={{ width: '4em', margin: '0 2px', padding: 0 }}
					min={20}
					max={1000}
					value={frameTime}
					onChange={(val) => setParams({ frameTime: val ?? 40 })}
				/>
			</div>
			<div>
				Cadence:
				<NumberInput
					style={{ width: '4em', margin: '0 2px', padding: 0 }}
					min={1}
					max={10}
					value={cadence}
					onChange={(val) => setParams({ cadence: val ? Math.floor(val) : defaultParams.cadence })}
				/>
			</div>
			<Checkbox label="Time slave" k="slave" />
		</>
	);
}

export const SunView: EventsPanel<Params> = {
	name: 'Sun View',
	Menu,
	Panel,
	defaultParams,
};
