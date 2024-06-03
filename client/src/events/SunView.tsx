import { useContext, useEffect, useRef, useState } from 'react';
import { LayoutContext, type ContextMenuProps, type LayoutContextType } from '../layout';
import { getSourceLink, serializeCoords, useCompoundTable } from './sources';
import { rowAsDict, useEventsState, useFeidCursor, useSource, useSources, type RowDict } from './eventsState';
import { equalValues } from './events';
import { apiGet, prettyDate } from '../util';
import { color } from '../app';
import { useQuery } from 'react-query';
import { font } from '../plots/plotUtil';
import { create } from 'zustand';
import { NumberInput } from '../Utility';

const MODES = ['SDO', 'FLR', 'WSA-ENLIL'] as const;
const PREFER_FLR = ['ANY', 'dMN', 'SFT'] as const;
const ENLIL_OPTS = ['density', 'velocity'] as const;
const SDO_SRC = ['AIA 193', 'AIA 193 diff', 'LASCO C2', 'LASCO C3', 'AIA 094', 'AIA 131', 'AIA 171', 'AIA 211', 'AIA 304', 'AIA 335'];
const defaultSettings = {
	mode: 'SDO' as typeof MODES[number],
	prefer: 'ANY' as typeof PREFER_FLR[number],
	src: 'AIA 193' as typeof SDO_SRC[number],
	enlilVar: 'density' as typeof SDO_SRC[number],
	frameTime: 50,
	slave: false,
};
type Params = Partial<typeof defaultSettings>;

const useSunViewState = create<{
	time: number,
	setTime: (a: number) => void
}>()(set => ({
	time: 0,
	setTime: time => set(s => ({ ...s, time }))
}));

const SFT_URL = 'https://www.lmsal.com/solarsoft/latest_events_archive/events_summary/';
const dMN_FLR = 'https://www.sidc.be/solardemon/science/flares_details.php?science=1&wavelength=94&delay=40&only_image=1&width=400';
const IMG_URL = 'https://cdaw.gsfc.nasa.gov/images/';

export function SunViewContextMenu({ params, setParams }: ContextMenuProps<Params>) {
	const para = { ...defaultSettings, ...params };
	const { mode, slave, frameTime } = para;
	const Select = ({ k , opts }: { k: 'mode'|'prefer'|'src'|'enlilVar', opts: readonly string[] }) => <select
		className='Borderless' value={para[k]} onChange={e => setParams({ [k]: e.target.value as any })}>
		{opts.map(m => <option key={m} value={m}>{m}</option>)}
	</select>;
	return <div className='Group'>
		<div>Mode: <Select k={'mode'} opts={MODES}/></div>
		{mode !== 'WSA-ENLIL' && <div>Prefer flare: <Select k={'prefer'} opts={PREFER_FLR}/></div>}
		{mode === 'WSA-ENLIL' && <div>Param: <Select k={'enlilVar'} opts={ENLIL_OPTS}/></div>}
		{mode === 'SDO' && <div>Src: <Select k={'src'} opts={SDO_SRC}/></div>}
		{mode === 'SDO' && <div>Frame time:<NumberInput style={{ width: '4em', margin: '0 2px', padding: 0 }}
			min={20} max={1000} value={frameTime} onChange={val => setParams({ frameTime: val ?? 40 })}/></div>}
		{mode === 'SDO' && <label>Time slave<input type='checkbox' style={{ paddingLeft: 4 }}
			checked={slave} onChange={e => setParams({ slave: e.target.checked })}/></label>}
	</div>;
}

export function EnlilView({ id }: { id: number | null }) {
	const { size, params } = useContext(LayoutContext)!;
	const { enlilVar } = { ...defaultSettings, ...params };

	const query = useQuery(['enlil', id], () => id == null ? id : apiGet<{ filename: string }>('events/enlil', { id }));
	
	const fname = query.data?.filename;
	const para = fname && (enlilVar === 'density' ? 'tim-den' : 'tim-vel');
	const url = fname && `https://iswa.gsfc.nasa.gov/downloads/${fname}.${para}.gif`;
	const dkiurl = fname && `https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/WSA-ENLIL/${id}/-1`;

	return <div onMouseDown={e => e.preventDefault()}>
		{query.isLoading && <div className='Center'>LOADING..</div>}
		{query.isError && <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>}
		{query.isSuccess && (!id || !url) && <div className='Center'>NO ENLIL MODEL</div>}
		{<img alt='' width={size.width} src={url} />}
		{url && <div className='Center' style={{ background: color('bg'), top: 11, padding: '0 2px 2px 2px', fontSize: 14 }}>
			<a target='_blank' rel='noreferrer' href={dkiurl}>#{id}</a>&nbsp;
			<a target='_blank' rel='noreferrer' href={url}>{para}.gif</a></div>}
	</div>;
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
		{state === 'error' && <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>}src
		<img style={{ transform: `translate(${move}px, ${move}px)`, visibility: ['done', 'init'].includes(state) ? 'visible' : 'hidden' }}
			width={imgSize * (1 + 2 * clip / 512) - 2} alt='' src={src}
			onError={() =>setState('error')}/>
	</div>;
}

function SDO({ time: refTime, start, end, lat, lon, title, src }:
{ time: number, start: number, end: number, lat: number | null, lon: number | null, title: string, src: string }) {
	const { size: nodeSize, params } = useContext(LayoutContext)! as LayoutContextType<Params>;
	const { src: source, slave, frameTime } = { ...defaultSettings, ...params };
	const { time: masterTime, setTime } = useSunViewState();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const size = Math.min(nodeSize.width, nodeSize.height);
	const [frame, setFrame] = useState(0);
	const cadence = 2;
	const isLsc = source.startsWith('LASCO');

	const query = useQuery({
		staleTime: Infinity,
		queryKey: ['sdo', source, start, end, cadence],
		queryFn: async () => {
			if (!start || !end)
				return [];
			const res = await apiGet<{ timestamps: number[] }>('events/sun_images',
				{ from: start, to: end, source });

			setFrame(0);

			return res.timestamps.filter((tst, i) => i % cadence === 0 && tst >= start && tst <= end).map(timestamp => {
				const dir = isLsc ? 'soho/lasco' :
					((source.endsWith('diff') ? 'sdo/aia_synoptic_rdf/' : 'sdo/aia_synoptic_nrt/') + source.split(' ')[1]);
				const time = new Date(timestamp * 1000);
				const year = time.getUTCFullYear();
				const mon = (time.getUTCMonth() + 1).toString().padStart(2, '0');
				const day = time.getUTCDate().toString().padStart(2, '0');
				const hour = time.getUTCHours().toString().padStart(2, '0');
				const min = time.getUTCMinutes().toString().padStart(2, '0');
				const sec = time.getUTCSeconds().toString().padStart(2, '0');
				const fname = `${year}${mon}${day}_${hour}${min}${sec}_` +
					(isLsc ? `lasc${source.at(-1)}rdf.png` : `sdo_a${source.split(' ')[1]}${source.endsWith('diff') ? 'rdf' : ''}.jpg`);
				const url = IMG_URL + `${dir}/${year}/${mon}/${day}/${fname}`;

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
		if (!query.data || slave)
			return;
		const inter = setInterval(() => {
			if (frame >= query.data.length)
				return setFrame(0);
			if (query.data[frame].loaded) {
				setTime(query.data[frame].timestamp);
				setFrame(f => f + 1 >= query.data.length ? 0 : f + 1);
			}
		}, frameTime);
		return () => clearInterval(inter);
	}, [frame, frameTime, query.data, setTime, slave]);

	useEffect(() => {
		if (!query.data || !slave)
			return;
		const foundIdx = query.data.findIndex(e => e.timestamp > masterTime);
		if (foundIdx < 0)
			setFrame(0);
		else
			setFrame(foundIdx);
	}, [masterTime, query.data, slave]);

	useEffect(() => {
		const time = query.data?.[frame]?.timestamp;
		if (!canvasRef.current)
			return;
		const { PI, sin, cos } = Math;
		const canvas = canvasRef.current;
		canvas.width = canvas.height = size;
		const ctx = canvasRef.current.getContext('2d')!;
		ctx.clearRect(0, 0, size, size);
		if (!time || isLsc)
			return;
		const doy = (time * 1000 - Date.UTC(new Date(time).getUTCFullYear(), 0, 0)) / 864e5 % 365.256;
		const aphDoy = 186;
		const ascDoy = 356;
		ctx.lineWidth = 1.5;
		ctx.font = font(10);
		ctx.setLineDash([8, 18]);
		ctx.strokeStyle = color('green');
		ctx.fillStyle = 'white';
		const scl = size / 512;
		const x0 = 256.5 * scl;
		const y0 = 243.5 * scl;
		const dist = 1 - 2 * Math.abs(aphDoy - doy) / 365.256;
		const rs = (205 - dist * 7) * scl;
		ctx.arc(x0, y0, rs, 0, 2 * PI);
		ctx.stroke();
		ctx.beginPath();
		if (!lon || Math.abs(lon) < 90)
			ctx.setLineDash([]);

		if (lat != null && lon != null) {
			const sunRotation = 360 / 25.38 / 86400; // kinda
			const rot = (time - refTime) * sunRotation;
			const decl = 7.155 * sin((doy - ascDoy) / 365.256 * 2 * PI);
			const flat = lat + decl;
			const flon = lon + rot;
			const x = x0 + rs * sin(flon / 180 * PI) * cos(flat / 180 * PI);
			const y = y0 + rs * -sin(flat / 180 * PI);
			ctx.arc(x, y, 20, 0, 2 * PI);
			ctx.fillText(`DOY=${doy.toFixed(1)}`, 4, 14);
			ctx.fillText(`incl=${decl.toFixed(2)}`, 4, 26);
			ctx.fillText(`rot=${rot.toFixed(2).padStart(5)}`, 4, 38);
			ctx.fillText(`dist=${dist.toFixed(2)}`, 4, 50);
		}
		ctx.stroke();

	}, [frame, size, query.data, lat, lon, refTime, isLsc]);

	const isLoaded = query.data && query.data.length > 0;

	return <div>
		{query.isLoading && <div className='Center'>LOADING..</div>}
		{query.isError && <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>}
		{!isLoaded && query.isSuccess && <div className='Center'>NO SDO DATA</div>}
		{!isLsc && isLoaded && <div style={{ position: 'absolute', zIndex: 2, color: 'white',
			top: size - size * 18 / 512 - 58, left: 4, fontSize: 12, lineHeight: 1.1 }}>
			<b>{src ?? ''}<br/>{title ?? ''}<br/>{serializeCoords({ lat, lon })}</b>
			<br/>{prettyDate(refTime)}</div>}
		{!isLsc && isLoaded && <div style={{ position: 'absolute', color: 'white',
			top: size - 18, right: 6, fontSize: 12 }}>{frame} / {query.data.length}</div>}
		<canvas ref={canvasRef} style={{ position: 'absolute', zIndex: 3 }}/>
		{isLoaded && <img alt='' src={query.data[frame]?.url} width={size}></img>}
	</div>;
}

export default function SunView() {
	const layoutParams = useContext(LayoutContext)?.params;
	const { mode, prefer } = { ...defaultSettings, ...layoutParams };
	const flares = useCompoundTable('flare');
	const cmes = useCompoundTable('cme');
	const { cursor } = useEventsState();
	const sources = useSources();
	const activeErupt = useSource('sources_erupt');
	const { start: feidTime } = useFeidCursor();

	if (mode === 'WSA-ENLIL') {
		if (cursor?.entity === 'CMEs') {
			const cme = rowAsDict(cmes.data[cursor.row], cmes.columns);
			return <EnlilView id={cme.enlil_id as number | null}/>;
		}
		const erupt = activeErupt ?? sources.find(s => s.erupt)?.erupt;
		const [linkColId, idColId] = getSourceLink('cme', 'DKI');
		const idColIdx = cmes.columns.findIndex(c => c.id === idColId);
		const found = erupt && cmes.data.find(row => row[0] === 'DKI' && equalValues(row[idColIdx], erupt[linkColId]));
		const id = found ? rowAsDict(found, cmes.columns).enlil_id as number : null;
		return <EnlilView id={id}/>;
	}

	const flare = (() => {
		if (cursor?.entity === 'flares')
			return rowAsDict(flares.data[cursor.row], flares.columns);
		const erupt = activeErupt ?? sources.find(s => s.erupt?.flr_source)?.erupt;
		if (!erupt || !erupt.flr_source) return null;
		const src = prefer === 'ANY' ? erupt.flr_source : prefer;
		const [linkColId, idColId] = getSourceLink('flare', src);
		const idColIdx = flares.columns.findIndex(c => c.id === idColId);
		const found = flares.data.find(row => row[0] === src && equalValues(row[idColIdx], erupt[linkColId]));
		return found ? rowAsDict(found, flares.columns) : null;
	})();

	if (mode === 'FLR') {
		if (!flare)
			return <div className='Center'>NO FLARE DATA</div>;
		if (flare.src === 'dMN' && flare.id)
			return <DemonFlareFilm id={flare.id as number}/>;
		if (flare.src === 'SFT')
			return <SFTFLare flare={flare}/>;
		return null;
	}
	if (cursor?.entity === 'CMEs') {
		const cme = rowAsDict(cmes.data[cursor.row], cmes.columns);
		const time = (cme.time as Date).getTime() / 1000;
		return <SDO {...{
			lat: cme.lat as number,
			lon: cme.lon as number,
			time,
			start: time - 3600 * 2,
			end: time + 3600 * 6,
			title: 'CME',
			src: cme.src as string
		}}/>;
	}
	if (flare) {
		const start = (flare.start_time as Date).getTime() / 1000;
		const end = (flare.start_time as Date ?? flare.start_time as Date).getTime() / 1000;
		return <SDO {...{
			lat: flare?.lat as number,
			lon: flare?.lon as number,
			time: start,
			start: start - 3600 * 2,
			end: end + 3600 * 3,
			title: flare.class as string,
			src: flare.src as string
		}}/>;
	}
	if (activeErupt?.lat && activeErupt?.lon && activeErupt?.cme_time ) {
		const start = (activeErupt.cme_time as Date).getTime() / 1000;
		return <SDO {...{
			lat: activeErupt?.lat as number,
			lon: activeErupt?.lon as number,
			time: start,
			start: start - 3600 * 2,
			end: start + 3600 * 5,
			title: 'CME',
			src: activeErupt.coords_source as string
		}}/>;
	}

	if (!feidTime)
		return null;
	const ftime = feidTime.getTime() / 1000;
	return <SDO {...{
		lat: null,
		lon: null,
		time:  ftime - 86400 * 2,
		start: ftime - 86400 * 3,
		end:   ftime - 86400 * 4,
		title: '',
		src: ''
	}}/>;

}