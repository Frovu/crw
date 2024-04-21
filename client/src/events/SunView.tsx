import { useContext, useEffect, useRef, useState } from 'react';
import { LayoutContext, type ContextMenuProps } from '../layout';
import {  getFlareLink, useFlaresTable } from './sources';
import { rowAsDict, useEventsState, useSources, useTable, type RowDict } from './eventsState';
import { equalValues } from './events';
import { apiGet, prettyDate } from '../util';
import { color } from '../app';
import { useQuery } from 'react-query';
import { font } from '../plots/plotUtil';

const MODES = ['SDO', 'FLR'] as const;
const PREFER_FLR = ['ANY', 'dMN', 'SFT'] as const;
const defaultSettings = {
	mode: 'SDO' as typeof MODES[number],
	prefer: 'ANY' as typeof PREFER_FLR[number]
};
type Params = Partial<typeof defaultSettings>;

const SFT_URL = 'https://www.lmsal.com/solarsoft/latest_events_archive/events_summary/';
const dMN_FLR = 'https://www.sidc.be/solardemon/science/flares_details.php?science=1&wavelength=94&delay=40&only_image=1&width=400';
const SDO_URL = 'https://cdaw.gsfc.nasa.gov/images/sdo/aia_synoptic/';

export function SunViewContextMenu({ params, setParams }: ContextMenuProps<Params>) {
	const { mode, prefer } = { ...defaultSettings, ...params };
	return <>
		<div>Mode: <select className='Borderless' value={mode} onChange={e => setParams({ mode: e.target.value as any })}>
			{MODES.map(m => <option key={m} value={m}>{m}</option>)}
		</select></div>
		{<div>Pref: <select className='Borderless' value={prefer} onChange={e => setParams({ prefer: e.target.value as any })}>
			{PREFER_FLR.map(m => <option key={m} value={m}>{m}</option>)}
		</select></div>}
	</>;
}

function DemonFlareFilm({ id }: { id: number }) {
	const { size: nodeSize } = useContext(LayoutContext)!;
	const size = Math.min(nodeSize.width, nodeSize.height);
	const ref = useRef<HTMLIFrameElement>(null);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		setLoaded(false);
		const tim = setTimeout(() => setLoaded(true), 2000);
		return () => clearTimeout(tim);
	}, [id]);

	return <>
		{!loaded && <div className='Center'>LOADING...</div>}
		<div style={{ transform: `scale(${size / 400})`, transformOrigin: 'top left', height: 400, width: 400, overflow: 'hidden' }}>
			<div style={{ position: 'absolute', height: '100%', width: '100%', zIndex: 2 }}/>
			<iframe ref={ref} title='solardemon' onLoad={() => setTimeout(() => setLoaded(true), 50)}
				style={{ border: 'none',  transform: 'translate(-8px, -8px)', visibility: loaded ? 'visible' : 'hidden' }}
				src={dMN_FLR+`&flare_id=${id}`} scrolling='no' 
				width={Math.max(size, 408)} height={Math.max(size, 408)}/>
		</div>
	</>;
}

function SFTFLare({ flare }: { flare: RowDict }) {
	const [state, setState] = useState('init' as 'init' | 'loading' | 'error' | 'done');
	const { size } = useContext(LayoutContext)!;
	const imgSize = Math.min(size.width, size.height);
	const time = flare.start_time as Date;

	const year = time.getUTCFullYear();
	const mon = (time.getUTCMonth() + 1).toString().padStart(2, '0');
	const day = time.getUTCDate().toString().padStart(2, '0');
	const hour = time.getUTCHours().toString().padStart(2, '0');
	const min = time.getUTCMinutes().toString().padStart(2, '0');
	const gev = `gev_${year}${mon}${day}_${hour}${min}`;

	const src = SFT_URL+`${year}/${mon}/${day}/${gev}/${gev}.png`;
	const clip = 40;
	const move = -clip * imgSize / 512;

	useEffect(() => {
		setState('init');
		const tim = setTimeout(() => setState(st => st === 'init' ? 'loading' : st), 30);
		const img = new Image();
		img.src = src;
		img.onload = () => setState('done');
		return () => clearTimeout(tim);
	}, [src]);

	return  <div style={{ overflow: 'hidden', height: imgSize }} onContextMenu={e => e.ctrlKey && e.stopPropagation()}>
		<div style={{ position: 'absolute', zIndex: 2, background: 'black', color: 'white', top: 2, left: 3,
			border: '1px solid white', padding: '1px 8px', fontSize: 14 }}>
			<b>{flare.class as any}</b> {prettyDate(flare.start_time as any)}</div>
		{state === 'loading' && <div className='Center'>LOADING...</div>}
		{state === 'error' && <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>}
		<img style={{ transform: `translate(${move}px, ${move}px)`, visibility: ['done', 'init'].includes(state) ? 'visible' : 'hidden' }}
			width={imgSize * (1 + 2 * clip / 512) - 2} alt='' src={src}
			onError={() =>setState('error')}/>
	</div>;
}

function SDO({ flare }: { flare: RowDict }) {
	const { size: nodeSize } = useContext(LayoutContext)!;
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const size = Math.min(nodeSize.width, nodeSize.height);
	const [frame, setFrame] = useState(0);
	const frameTime = 40;
	const cadence = 2;

	const t1 = Math.floor((flare.start_time as Date).getTime() / 1000) - 7200;
	const t2 = Math.floor((flare.end_time as Date ?? flare.start_time as Date).getTime() / 1000) + 7200;
	const wavelen = '193';

	const query = useQuery({
		staleTime: Infinity,
		queryKey: ['sdo', wavelen, t1, t2, cadence],
		queryFn: async () => {
			if (!t1 || !t2)
				return [];
			const res = await apiGet<{ timestamps: number[] }>('events/sdo',
				{ from: t1, to: t2, wavelen });

			setFrame(0);

			return res.timestamps.filter((tst, i) => i % cadence === 0 && tst >= t1 && tst <= t2).map(timestamp => {
				const time = new Date(timestamp * 1000);
				const year = time.getUTCFullYear();
				const mon = (time.getUTCMonth() + 1).toString().padStart(2, '0');
				const day = time.getUTCDate().toString().padStart(2, '0');
				const hour = time.getUTCHours().toString().padStart(2, '0');
				const min = time.getUTCMinutes().toString().padStart(2, '0');
				const sec = time.getUTCSeconds().toString().padStart(2, '0');
				const fname = `${year}${mon}${day}_${hour}${min}${sec}_sdo_a${wavelen}.jpg`;
				const url = SDO_URL + `${wavelen}/${year}/${mon}/${day}/${fname}`;

				const img = new Image();
				img.src = url;
				const entry = { timestamp, url, img, loaded: false };
				img.onload = img.onerror = () => { entry.loaded = true; };
				setTimeout(() => { entry.loaded = true; }, 5000);

				return entry;
			});
		}
	});

	useEffect(() => {
		if (!query.data) return;
		const inter = setInterval(() => {
			if (frame >= query.data.length)
				setFrame(0);
			if (query.data[frame].loaded)
				setFrame(f => f + 1 >= query.data.length ? 0 : f + 1);
		}, frameTime);
		return () => clearInterval(inter);
	}, [frame, query.data]);

	useEffect(() => {
		const time = query.data?.[frame]?.timestamp;
		if (!canvasRef.current || !time)
			return;
		const { PI, sin, cos } = Math;
		const canvas = canvasRef.current;
		canvas.width = canvas.height = size;
		const ctx = canvasRef.current.getContext('2d')!;
		const doy = (time * 1000 - Date.UTC(new Date(time).getUTCFullYear(), 0, 0)) / 864e5 % 365.256;
		const aphDoy = 186;
		const ascDoy = 356;
		ctx.clearRect(0, 0, size, size);
		ctx.lineWidth = 2;
		ctx.font = font(10);
		ctx.setLineDash([8, 18]);
		ctx.strokeStyle = ctx.fillStyle = color('green');
		const scl = size / 512;
		const x0 = 256.5 * scl;
		const y0 = 243.5 * scl;
		const dist = 1 - 2 * Math.abs(aphDoy - doy) / 365.256;
		const rs = (205 - dist * 7) * scl;
		ctx.arc(x0, y0, rs, 0, 2 * PI);
		ctx.stroke();
		ctx.beginPath();
		ctx.lineWidth = 2;
		ctx.setLineDash([]);

		if (flare.lat != null && flare.lon != null && flare.start_time instanceof Date) {
			const refTime = flare.start_time.getTime() / 1000;
			const sunRotation = 360 / 25.38 / 86400; // kinda
			const rot = (time - refTime) * sunRotation;
			const decl = 7.155 * sin((doy - ascDoy) / 365.256 * 2 * PI);
			const lat = (flare.lat as number) + decl;
			const lon = (flare.lon as number) + rot;
			const x = x0 + rs * sin(lon / 180 * PI) * cos(lat / 180 * PI);
			const y = y0 + rs * -sin(lat / 180 * PI);
			ctx.arc(x, y, 20, 0, 2 * PI);
			ctx.fillText(`DOY=${doy.toFixed(1)}`, 4, 14);
			ctx.fillText(`incl=${decl.toFixed(2)}`, 4, 26);
			ctx.fillText(`rot=${rot.toFixed(2).padStart(5)}`, 4, 38);
			ctx.fillText(`dist=${dist.toFixed(2)}`, 4, 50);
		}
		ctx.stroke();

	}, [frame, flare, size, query.data]);

	const isLoaded = query.data && query.data.length > 0;

	return <div>
		{query.isLoading && <div className='Center'>LOADING..</div>}
		{query.isError && <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>}
		{!isLoaded && query.isFetched && <div className='Center'>NO SDO DATA</div>}
		{isLoaded && <div style={{ position: 'absolute', color: 'white', bottom: 2, right: 8, fontSize: 12 }}>{frame} / {query.data.length}</div>}
		<canvas ref={canvasRef} style={{ position: 'absolute', zIndex: 3 }}/>
		{isLoaded && <img alt='' src={query.data[frame]?.url} width={size}></img>}
	</div>;
}

export default function SunView() {
	const layoutParams = useContext(LayoutContext)?.params;
	const { mode, prefer } = { ...defaultSettings, ...layoutParams };
	const { data, columns } = useFlaresTable();
	const eruptions = useTable('sources_erupt');
	const { cursor } = useEventsState();
	const sources = useSources();

	const flare = (() => {
		if (cursor?.entity === 'flares') {
			const atCurs = rowAsDict(data[cursor.row] as any, columns);
			return (prefer === 'ANY' || atCurs.src === prefer) ? atCurs : null;
		}
		const erupt = cursor?.entity === 'sources_erupt'
			? rowAsDict(eruptions.data[cursor.row] as any, eruptions.columns)
			: sources.find(s => s.erupt)?.erupt;
		if (!erupt || !erupt.flr_source) return null;
		const src = prefer === 'ANY' ? erupt.flr_source : prefer;
		const { linkColId, idColId } = getFlareLink(src);
		const idColIdx = columns.findIndex(c => c.id === idColId);
		const found = data.find(row => row[0] === src && equalValues(row[idColIdx], erupt[linkColId]));
		return found ? rowAsDict(found as any, columns) : null;
	})();

	if (mode === 'SDO' && flare)
		return <SDO flare={flare}/>;
	if (!flare)
		return <div className='Center'>NO FLARE DATA</div>;
	if (flare.src === 'dMN' && flare.id)
		return <DemonFlareFilm id={flare.id as number}/>;
	if (flare.src === 'SFT')
		return <SFTFLare flare={flare}/>;
	return null;
}