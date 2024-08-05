import type { ContextMenuProps } from '../layout';
import { defaultPlotParams, type EventsPanel } from './events';
import { PlotIntervalInput } from './ExportPlot';

import { EventsCheckbox, FeidTable } from './EventsTable';
import { GeomagnPlot } from '../plots/time/Geomagn';
import { GSMPlot } from '../plots/time/GSM';
import { RSMPlot } from '../plots/time/Circles';
import { IMFPlot } from '../plots/time/IMF';
import { SatParticlesPlot } from '../plots/time/Particles';
import { SWPlasmaPlot } from '../plots/time/SW';
import { CMEHeightPlot } from '../plots/time/CMEHeight';
import { SWTypesPlot } from '../plots/time/SWTypes';
import { XraysPlot } from '../plots/time/XRays';

const panels = [
	GSMPlot,
	IMFPlot,
	SWPlasmaPlot,
	SWTypesPlot,
	GeomagnPlot,
	RSMPlot,
	FeidTable,
	SatParticlesPlot,
	CMEHeightPlot,
	XraysPlot
];

function PanelWrapper<T>({ panel }: { panel: EventsPanel<T> }) {
	return <div style={{ height: '100%', userSelect: 'none',
		overflow: 'clip', border: panel.name?.includes('Table') ? 'unset' : '1px var(--color-border) solid' }}>
		<panel.Panel/>
	</div>;
}

function MenuWrapper<T>({ panel, params, setParams, Checkbox }:
{ panel: EventsPanel<T> } & ContextMenuProps<any>) {
	const type = panel.name;
	return <>
		{panel.isPlot && <>
			<div className='Row'>
				<PlotIntervalInput solar={panel.isSolar && (type !== 'Particles' || params.solarTime)}/>
				{type === 'Particles' && <Checkbox text='solar' k='solarTime'/>}
			</div>
			<div className='separator'/>
			<div className='Row'>
				<EventsCheckbox text='grid' k='showGrid'/>
				{(!panel.isStat || type === 'Events history')
					&& <EventsCheckbox text='markers' k='showMarkers'/>}
				<EventsCheckbox text='legend' k='showLegend'/>
				{(type === 'Correlation')
					&& <EventsCheckbox text='title' k='showTitle'/>}
			</div>
		</>}
		{panel.isPlot && !panel.isStat && <>
			<div className='separator'/>
			<div className='Row'>
				<Checkbox text='time axis' k='showTimeAxis'/>
				<Checkbox text='meta' k='showMetaInfo'/>
				<Checkbox text='label' k='showMetaLabels'/>
			</div>
			{(!panel.isSolar || (type === 'Particles' && params.solarTime === false)) && <><div className='Row'>
				<EventsCheckbox text='show unlisted' k='plotUnlistedEvents'/>
				<EventsCheckbox text='MCs' k='showMagneticClouds'/>
				<EventsCheckbox text='ends' k='showEventsEnds'/>
			</div></>}
		</>}
		{panel.Menu && <>
			<div className='separator'/>
			<panel.Menu {...{ params, setParams, Checkbox }}/>
		</>}
	</>;

}

export const eventsPanels = Object.fromEntries(panels.map(p => [p.name, {
	...p,
	defaultParams: { ...defaultPlotParams, ...p.defaultParams },
	Panel: () => <PanelWrapper panel={p as any}/>,
	Menu: (props: ContextMenuProps<any>) => <MenuWrapper panel={p as any} {...props}/>
}]));