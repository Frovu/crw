import { useEventListener } from '../util';
import AppLayout from '../Layout';
import { useEventsSettings } from './core/util';
import type { ContextMenuProps, LayoutsMenuDetails } from '../layout';
import type { EventsPanel } from './core/util';
import { defaultPlotParams } from '../plots/basicPlot';

import { ExportControls, ExportPreview, PlotIntervalInput, renderOne } from './export/ExportPlot';
import { EventsCheckbox, FeidTable } from './panels/FeidPanel';
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
import { useContextMenu } from '../app';
import { Correlation } from '../plots/Correlate';
import { Histogram } from '../plots/Histogram';
import { SuperposedEpochs } from '../plots/SuperposedEpochs';
import { EventsHistory } from '../plots/EventsHistory';
import { SWPCHint } from './panels/SWPC';

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
	FeidTable,
	SatParticlesPlot,
	CMEHeightPlot,
	XraysPlot,
	SunView,
	ExportControls,
	ExportPreview,
	ColorsSettings,
	InsertControls,
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
	const details = (useContextMenu((state) => state.menu?.detail) as LayoutsMenuDetails | null) ?? null;
	const { name: type, isPlot, isSolar, isStat, Menu } = panel;
	return (
		<>
			{isPlot && (
				<>
					<div className="Row">
						<PlotIntervalInput solar={isSolar && (type !== 'Particles' || params.solarTime)} />
						{type === 'Particles' && <Checkbox text="solar" k="solarTime" />}
					</div>
					<div className="separator" />
					<div className="Row">
						<EventsCheckbox text="grid" k="showGrid" />
						{(!isStat || type === 'Events history') && <EventsCheckbox text="markers" k="showMarkers" />}
						<EventsCheckbox text="legend" k="showLegend" />
						{type === 'Correlation' && <EventsCheckbox text="title" k="showTitle" />}
					</div>
				</>
			)}
			{isPlot && !isStat && (
				<>
					<div className="separator" />
					<div className="Row">
						<Checkbox text="time axis" k="showTimeAxis" />
						<Checkbox text="meta" k="showMetaInfo" />
						<Checkbox text="label" k="showMetaLabels" />
					</div>
					{(!isSolar || (type === 'Particles' && params.solarTime === false)) && (
						<>
							<div className="Row">
								<EventsCheckbox text="show unlisted" k="plotUnlistedEvents" />
								<EventsCheckbox text="MCs" k="showMagneticClouds" />
								<EventsCheckbox text="ends" k="showEventsEnds" />
							</div>
						</>
					)}
					{Menu && <div className="separator" />}
				</>
			)}
			{Menu && (
				<>
					<Menu {...{ params, setParams, Checkbox }} />
				</>
			)}
			{isPlot && (
				<>
					<div className="separator" />
					{details && <button onClick={() => renderOne(details.nodeId)}>Open image in new tab</button>}
				</>
			)}
		</>
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
