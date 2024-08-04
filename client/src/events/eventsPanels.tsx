import type { ReactNode } from 'react';
import { GeomagnPlot } from '../plots/time/Geomagn';
import { GSMPlot } from '../plots/time/GSM';
import { FeidTable } from './EventsTable';
import type { EventsPanel } from './events';

const panels = [
	GeomagnPlot,
	GSMPlot,
	FeidTable
];

function PanelWrapper<T>({ panel }: { panel: EventsPanel<T> }) {
	return <div style={{ height: '100%', userSelect: 'none',
		overflow: 'clip', border: panel.name?.includes('Table') ? 'unset' : '1px var(--color-border) solid' }}>
		<panel.Panel/>
	</div>;
}

export const eventsPanels = Object.fromEntries(panels.map(p => [p.name, {
	...p,
	Panel: () => <PanelWrapper panel={p as any}/>
}]));