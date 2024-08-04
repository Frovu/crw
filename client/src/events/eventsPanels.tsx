import { GeomagnPlot } from '../plots/time/Geomagn';
import { GSMPlot } from '../plots/time/GSM';
import { EventsCheckbox, FeidTable } from './EventsTable';
import type { EventsPanel } from './events';
import { RSMPlot } from '../plots/time/Circles';
import type { ContextMenuProps } from '../layout';
import { PlotIntervalInput } from './ExportPlot';

const panels = [
	GeomagnPlot,
	GSMPlot,
	RSMPlot,
	FeidTable
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
			<div className='separator'/>
		</>}
		<div className='Group'>
			<panel.Menu {...{ params, setParams, Checkbox }}/>
		</div>
	</>;

}

export const eventsPanels = Object.fromEntries(panels.map(p => [p.name, {
	...p,
	Panel: () => <PanelWrapper panel={p as any}/>,
	Menu: (props: ContextMenuProps<any>) => <MenuWrapper panel={p as any} {...props}/>
}]));