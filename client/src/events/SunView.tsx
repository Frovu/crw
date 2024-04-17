import { useContext } from 'react';
import { LayoutContext, type ContextMenuProps } from '../layout';
import { flaresLinkId, getFlareLink, useFlaresTable } from './sources';
import { rowAsDict, useEventsState, useSources, useTable } from './eventsState';
import { equalValues } from './events';

const MODES = ['SDO', 'FLR'] as const;
const defaultSettings = {
	mode: 'SDO' as typeof MODES[number]
};
type Params = Partial<typeof defaultSettings>;

const SFT_URL = 'https://www.lmsal.com/solarsoft/latest_events_archive/events_summary/';

export function SunViewContextMenu({ params, setParams }: ContextMenuProps<Params>) {
	return <>
		<div>Mode: <select className='Borderless' value={params.mode} onChange={e => setParams({ mode: e.target.value as any })}>
			{MODES.map(m => <option key={m} value={m}>{m}</option>)}
		</select></div>
	</>;
}

function SunViewFlr() {
	const { data, columns } = useFlaresTable();
	const eruptions = useTable('sources_erupt');
	const { cursor } = useEventsState();
	const sources = useSources();

	const flare = (() => {
		if (cursor?.entity === 'flares')
			return rowAsDict(data[cursor.row] as any, columns);
		const erupt = cursor?.entity === 'sources_erupt'
			? rowAsDict(data[cursor.row] as any, eruptions.columns)
			: sources.find(s => s.erupt)?.erupt;
		if (!erupt || !erupt.flr_source) return null;
		const { linkColId, idColId } = getFlareLink(erupt.flr_source);
		const idColIdx = columns.findIndex(c => c.id === idColId);
		const found = data.find(row => equalValues(row[idColIdx], erupt[linkColId]));
		return found ? rowAsDict(found as any, columns) : null;
	})();

	if (!flare)
		return <div className='Center'>NO FLARE SELECTED</div>;
	const time = flare.start_time as Date;
	console.log(time)
	const year = time.getUTCFullYear();
	const mon = (time.getUTCMonth() + 1).toString().padStart(2, '0');
	const day = time.getUTCDate().toString().padStart(2, '0');
	const hour = time.getUTCHours().toString().padStart(2, '0');
	const min = time.getUTCMinutes().toString().padStart(2, '0');
	if (flare.src === 'SFT') {
		const gev = `gev_${year}${mon}${day}_${hour}${min}`;
		console.log(SFT_URL+`${year}/${mon}/${day}/${gev}/${gev}.png`)
		return <img alt='solarsoft' src={SFT_URL+`${year}/${mon}/${day}/${gev}/${gev}.png`}/>;
	}
		
}

export default function SunView() {
	const layoutParams = useContext(LayoutContext)?.params;
	const { mode } = { ...defaultSettings, ...layoutParams };

	if (mode === 'SDO')
		return 'not implemented';
	return <SunViewFlr/>;
}