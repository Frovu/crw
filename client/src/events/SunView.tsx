import { useContext, useEffect, useState } from 'react';
import { LayoutContext, type ContextMenuProps } from '../layout';
import {  getFlareLink, useFlaresTable } from './sources';
import { rowAsDict, useEventsState, useSources, useTable, type RowDict } from './eventsState';
import { equalValues } from './events';
import { prettyDate } from '../util';
import { color } from '../app';

const MODES = ['SDO', 'FLR'] as const;
const PREFER_FLR = ['ANY', 'dMN', 'SFT'] as const;
const defaultSettings = {
	mode: 'SDO' as typeof MODES[number],
	prefer: 'ANY' as typeof PREFER_FLR[number]
};
type Params = Partial<typeof defaultSettings>;

const SFT_URL = 'https://www.lmsal.com/solarsoft/latest_events_archive/events_summary/';
const dMN_FLR = 'https://www.sidc.be/solardemon/science/flares_details.php?science=1&wavelength=94&delay=40&only_image=1&width=400';

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
	const [loaded, setLoaded] = useState(false);

	useEffect(() => setLoaded(false), [id]);

	return <>
		{!loaded && <div className='Center'>LOADING...</div>}
		<div style={{ transform: `scale(${size / 400})`, transformOrigin: 'top left', height: 400, width: 400, overflow: 'hidden' }}>
			<iframe title='solardemon' onLoad={() => setTimeout(() => setLoaded(true), 50)}
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
			onLoad={() => setState('done')} onError={() =>setState('error')}/>
	</div>;
}

function SunViewFlr() {
		
}

export default function SunView() {
	const layoutParams = useContext(LayoutContext)?.params;
	const { mode, prefer } = { ...defaultSettings, ...layoutParams };
	const { data, columns } = useFlaresTable();
	const eruptions = useTable('sources_erupt');
	const { cursor } = useEventsState();
	const sources = useSources();

	const flare = mode === 'FLR' && (() => {
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
		console.log(linkColId, found)
		return found ? rowAsDict(found as any, columns) : null;
	})();

	if (mode === 'SDO')
		return 'not implemented';
	if (!flare)
		return <div className='Center'>NO DATA</div>;
	if (flare.src === 'dMN' && flare.id)
		return <DemonFlareFilm id={flare.id as number}/>;
	if (flare.src === 'SFT')
		return <SFTFLare flare={flare}/>;
	return null;
}