import { useContext, useEffect, useState } from 'react';
import { LayoutContext } from '../../layout';
import { prettyDate } from '../../util';
import { equalValues, type EventsPanel } from '../core/util';
import { useEventsState, useSelectedSource } from '../core/eventsState';
import { useCompoundTable } from '../core/query';
import { getSourceLink } from '../core/sourceActions';

const SFT_URL = 'https://www.lmsal.com/solarsoft/latest_events_archive/events_summary/';

function Panel() {
	const { size } = useContext(LayoutContext)!;
	const flares = useCompoundTable('flare');
	const { cursor } = useEventsState();
	const erupt = useSelectedSource('sources_erupt', true);
	const [state, setState] = useState('init' as 'init' | 'loading' | 'error' | 'done');

	const flare = (() => {
		if (flares && cursor?.entity === 'flare') return flares.entry(flares.data[cursor.row]);
		if (!erupt || !flares) return null;
		const link = getSourceLink('flare', 'SFT');
		const idColIdx = flares.index[link.id]!;
		const found = erupt && flares.data.find((row) => row[0] === 'SFT' && equalValues(row[idColIdx], erupt[link.link]));
		return found ? flares.entry(found) : null;
	})();

	const imgSize = Math.min(size.width, size.height);

	const src =
		flare &&
		(() => {
			const time = flare.start_time;
			const year = time.getUTCFullYear();
			const mon = (time.getUTCMonth() + 1).toString().padStart(2, '0');
			const day = time.getUTCDate().toString().padStart(2, '0');
			const hour = time.getUTCHours().toString().padStart(2, '0');
			const min = time.getUTCMinutes().toString().padStart(2, '0');
			const gev = `gev_${year}${mon}${day}_${hour}${min}`;
			return SFT_URL + `${year}/${mon}/${day}/${gev}/${gev}.png`;
		})();
	const clip = 40;
	const move = (-clip * imgSize) / 512;

	useEffect(() => {
		if (!src) return;
		setState('init');
		const tim = setTimeout(() => setState((st) => (st === 'init' ? 'loading' : st)), 30);
		const img = new Image();
		img.src = src;
		img.onload = () => setState('done');
		return () => clearTimeout(tim);
	}, [src]);

	if (!flare) return <div className="center">NO SFT FLARE</div>;

	return (
		<div style={{ overflow: 'hidden', height: imgSize }} onContextMenu={(e) => e.ctrlKey && e.stopPropagation()}>
			<div className="absolute z-2 bg-black text-white top-[1px] left-[3px] border border-white px-2 text-sm">
				<b>{flare.class as any}</b> {prettyDate(flare.start_time as any)}
			</div>
			{state === 'loading' && <div className="center">LOADING...</div>}
			{state === 'error' && <div className="center text-red">FAILED TO LOAD</div>}
			<img
				style={{
					transform: `translate(${move}px, ${move}px)`,
					visibility: ['done', 'init'].includes(state) ? 'visible' : 'hidden',
					minWidth: imgSize * (1 + (2 * clip) / 512) - 2,
				}}
				alt=""
				src={src!}
				onError={() => setState('error')}
			/>
		</div>
	);
}

export const SFTFlare: EventsPanel<{}> = {
	name: 'SFT FLR View',
	Panel,
};
