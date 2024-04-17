import { useContext } from 'react';
import { LayoutContext, type ContextMenuProps } from '../layout';
import { flaresLinkId, getFlareLink, useFlaresTable } from './sources';
import { rowAsDict, useEventsState, useSources, useTable } from './eventsState';

const MODES = ['SDO', 'FLR'] as const;
const defaultSettings = {
	mode: 'SDO' as typeof MODES[number]
};
type Params = Partial<typeof defaultSettings>;

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
		return data.find(row => row[idColIdx])

	})();

	return <div className='Center'>NO FLARE SELECTED</div>;

	return null;
}

export default function SunView() {
	const layoutParams = useContext(LayoutContext)?.params;
	const { mode } = { ...defaultSettings, ...layoutParams };

	if (mode === 'SDO')
		return 'not implemented';
	return <SunViewFlr/>;
}