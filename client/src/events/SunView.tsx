import { useContext, useEffect, useState } from 'react';
import { LayoutContext, type ContextMenuProps } from '../layout';
import { flaresLinkId, getFlareLink, useFlaresTable } from './sources';
import { rowAsDict, useEventsState, useSources, useTable } from './eventsState';
import { equalValues } from './events';
import { prettyDate } from '../util';
import { color } from '../app';

const MODES = ['SDO', 'FLR'] as const;
const defaultSettings = {
	mode: 'SDO' as typeof MODES[number]
};
type Params = Partial<typeof defaultSettings>;

const SFT_URL = 'https://www.lmsal.com/solarsoft/latest_events_archive/events_summary/';
const dMN_URL = 'https://www.sidc.be/solardemon/detections/science/094/flares/';

export function SunViewContextMenu({ params, setParams }: ContextMenuProps<Params>) {
	return <>
		<div>Mode: <select className='Borderless' value={params.mode} onChange={e => setParams({ mode: e.target.value as any })}>
			{MODES.map(m => <option key={m} value={m}>{m}</option>)}
		</select></div>
	</>;
}

function DemonFlareFilm({ id }: { id: number }) {
	const [frame, setFrame] = useState(0);
	const [frameCount, setFrameCount] = useState<number | null>(null);

	useEffect(() => {
		const interval = setInterval(() => setFrame(f => (frameCount != null && f >= frameCount) ? 0 : f + 1), 150);
		return () => clearInterval(interval);
	}, [frameCount]);

	useEffect(() => {
		setFrameCount(null);
		setFrame(0);
	}, [id]);
	console.log(frame, frameCount)

	return <div>
		<img alt='' onError={() => { console.log(123); setFrameCount(frame); setFrame(0); }}
			src={dMN_URL+`${id}/cl_${frame.toString().padStart(5, '0')}.jpg`}></img>
	</div>;
}

function SunViewFlr() {
	const { size } = useContext(LayoutContext)!;
	const { data, columns } = useFlaresTable();
	const eruptions = useTable('sources_erupt');
	const { cursor } = useEventsState();
	const sources = useSources();

	const flare = (() => {
		if (cursor?.entity === 'flares')
			return rowAsDict(data[cursor.row] as any, columns);
		const erupt = cursor?.entity === 'sources_erupt'
			? rowAsDict(eruptions.data[cursor.row] as any, eruptions.columns)
			: sources.find(s => s.erupt)?.erupt;
		if (!erupt || !erupt.flr_source) return null;
		const { linkColId, idColId } = getFlareLink(erupt.flr_source);
		console.log(erupt)
		const idColIdx = columns.findIndex(c => c.id === idColId);
		const found = data.find(row => equalValues(row[idColIdx], erupt[linkColId]));
		return found ? rowAsDict(found as any, columns) : null;
	})();

	if (!flare)
		return <div className='Center'>NO FLARE SELECTED</div>;
	if (flare.src === 'dMN' && flare.id)
		return <DemonFlareFilm id={flare.id as number}/>;
	if (flare.src !== 'SFT')
		return null;
	const imgSize = Math.min(size.width, size.height);
	const time = flare.start_time as Date;
	const year = time.getUTCFullYear();
	const mon = (time.getUTCMonth() + 1).toString().padStart(2, '0');
	const day = time.getUTCDate().toString().padStart(2, '0');
	const hour = time.getUTCHours().toString().padStart(2, '0');
	const min = time.getUTCMinutes().toString().padStart(2, '0');
	const clip = 40;
	const move = -clip * imgSize / 512;
	const gev = `gev_${year}${mon}${day}_${hour}${min}`;
	return  <div style={{ overflow: 'hidden', height: imgSize }} onContextMenu={e => e.ctrlKey && e.stopPropagation()}>
		<div style={{ position: 'absolute', zIndex: 2, background: 'black', color: 'white', top: 2, left: 3,
			border: '1px solid white', padding: '1px 8px', fontSize: 14 }}>
			<b>{flare.class as any}</b> {prettyDate(flare.start_time as any)}</div>
		<img style={{ transform: `translate(${move}px, ${move}px)` }} width={imgSize * (1 + 2 * clip / 512) - 2} 
			alt='' src={SFT_URL+`${year}/${mon}/${day}/${gev}/${gev}.png`}/>;
	</div> ;
		
}

export default function SunView() {
	const layoutParams = useContext(LayoutContext)?.params;
	const { mode } = { ...defaultSettings, ...layoutParams };

	if (mode === 'SDO')
		return 'not implemented';
	return <SunViewFlr/>;
}