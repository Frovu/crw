import { useEventListener } from '../util';
import AppLayout from '../Layout';
import { useEventsSettings } from './core/util';
import type { ContextMenuProps, LayoutsMenuDetails } from '../layout';
import type { EventsPanel } from './core/util';
import { defaultPlotParams } from '../plots/basicPlot';

import { ExportControls, ExportPreview, PlotIntervalInput, renderOne } from './export/ExportPlot';
import { FeidTable } from './panels/FeidPanel';
import { GeomagnPlot } from '../plots/time/Geomagn';
import { GSMPlot } from '../plots/time/GSM';
import { RSMPlot } from '../plots/time/Circles';
import { IMFPlot } from '../plots/time/IMF';
import { SatParticlesPlot } from '../plots/time/Particles';
import { SWPlasmaPlot } from '../plots/time/SW';
import { CMEHeightPlot } from '../plots/time/CMEHeight';
import { SWTypesPlot } from '../plots/time/SWTypes';
import { XraysPlot } from '../plots/time/XRays';
import { SunView } from './panels/SunView';
import { ColorsSettings } from '../Colors';
import { InsertControls } from './insert/Insert';
import { CMETable, FlaresTable, ICMETable } from './tables/EruptiveEntity';
import { EruptionsTable } from './tables/Eruptions';
import { HolesTable } from './tables/HolesSrc';
import { ChimeraHoles } from './tables/HolesChimera';
import { SolenHoles } from './tables/HolesSolen';
import { useContextMenuStore } from '../app';
import { Correlation } from '../plots/Correlate';
import { Histogram } from '../plots/Histogram';
import { SuperposedEpochs } from '../plots/SuperposedEpochs';
import { EventsHistory } from '../plots/EventsHistory';
import { SWPCHint } from './panels/SWPC';
import { EventsCheckbox } from '../components/Checkbox';
import { Bolt, ChartLine, ChartNoAxesColumn, ChartSpline, Sun, Table } from 'lucide-react';

const panels: EventsPanel<any>[] = [
	GSMPlot,
	IMFPlot,
	SWPlasmaPlot,
	SWTypesPlot,
	GeomagnPlot,
	RSMPlot,
	Correlation,
	Histogram,
	SuperposedEpochs,
	EventsHistory,
	SatParticlesPlot,
	CMEHeightPlot,
	XraysPlot,
	SunView,
	ExportControls,
	ExportPreview,
	ColorsSettings,
	InsertControls,
	FeidTable,
	EruptionsTable,
	HolesTable,
	FlaresTable,
	CMETable,
	ICMETable,
	ChimeraHoles,
	SolenHoles,
	SWPCHint,
	{
		name: 'Empty',
		Panel: () => null,
	},
];

function PanelWrapper<T>({ panel }: { panel: EventsPanel<T> }) {
	return (
		<div
			style={{
				height: '100%',
				userSelect: 'none',
				overflow: 'clip',
				border: panel.name?.includes('Table') ? 'unset' : '1px var(--color-border) solid',
			}}
		>
			<panel.Panel />
		</div>
	);
}

function MenuWrapper<T>({ panel, params, setParams, Checkbox }: { panel: EventsPanel<T> } & ContextMenuProps<any>) {
	const details = (useContextMenuStore((state) => state.menu?.detail) as LayoutsMenuDetails | null) ?? null;
	const { name: type, isPlot, isSolar, isStat, Menu } = panel;
	return (
		<div className="flex flex-col items-center">
			{isPlot && (
				<>
					<div className="Row">
						<PlotIntervalInput solar={isSolar && (type !== 'Particles' || params.solarTime)} />
						{type === 'Particles' && <Checkbox label="solar" k="solarTime" />}
					</div>
					<div className="separator" />
					<div className="Row">
						<EventsCheckbox label="grid" k="showGrid" />
						{(!isStat || type === 'Events history') && <EventsCheckbox label="markers" k="showMarkers" />}
						<EventsCheckbox label="legend" k="showLegend" />
						{type === 'Correlation' && <EventsCheckbox label="title" k="showTitle" />}
					</div>
				</>
			)}
			{isPlot && !isStat && (
				<>
					<div className="separator" />
					<div className="Row">
						<Checkbox label="time axis" k="showTimeAxis" />
						<Checkbox label="meta" k="showMetaInfo" />
						<Checkbox label="label" k="showMetaLabels" />
					</div>
					{(!isSolar || (type === 'Particles' && params.solarTime === false)) && (
						<>
							<div className="Row">
								<EventsCheckbox label="show unlisted" k="plotUnlistedEvents" />
								<EventsCheckbox label="MCs" k="showMagneticClouds" />
								<EventsCheckbox label="ends" k="showEventsEnds" />
							</div>
						</>
					)}
					{Menu && <div className="separator" />}
				</>
			)}
			{Menu && <Menu {...{ params, setParams, Checkbox }} />}
			{isPlot && (
				<>
					<div className="separator" />
					{details && <button onClick={() => renderOne(details.nodeId)}>Open image in new tab</button>}
				</>
			)}
		</div>
	);
}

const eventsPanels = Object.fromEntries(
	panels.map((p) => [
		p.name,
		{
			...p,
			defaultParams: { ...defaultPlotParams, ...p.defaultParams },
			Panel: () => <PanelWrapper panel={p as any} />,
			Menu: (props: ContextMenuProps<any>) => <MenuWrapper panel={p as any} {...props} />,
			Icon: p.name.includes('Sun')
				? Sun
				: p.isSolar
				? ChartSpline
				: p.isStat
				? ChartNoAxesColumn
				: p.isPlot
				? ChartLine
				: p.name.includes('Table') || p.name.includes('Holes')
				? Table
				: Bolt,
		},
	])
);

export default function EventsApp() {
	const { reset } = useEventsSettings();

	useEventListener('resetSettings', reset);

	return (
		<>
			<title>FEID - Forbush Effects and Interplanetary Disturbances database</title>
			<meta
				name="description"
				content="Multifunctional online interface to the Forbush Effects and Interplanetary Disturbances database"
			/>
			<AppLayout panels={eventsPanels} />
		</>
	);
}
