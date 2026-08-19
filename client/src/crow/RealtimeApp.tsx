import { useContextMenuStore } from '../app/app';
import AppLayout from '../app/Layout';
import { useLayoutsStore, type ContextMenuProps, type LayoutsMenuDetails } from '../app/layout';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { RSMPlot } from '../plots/time/CirclesPlot';
import type { EventsPanel } from '../events/core/util';
import { renderPlotInANewTab } from '../events/export/exportablePlots';
import { defaultPlotParams } from '../plots/common/types';
import { CustomPlot } from '../plots/time/CustomPlot';
import { SatParticlesPlot } from '../plots/time/Particles';
import { cn } from '../util';
import CrowController from './core/CrowController';
import { useCrowSettings } from './core/crowSettings';
import { useRealtimeUpdater } from './core/realtime';
import { RSMHourPlot } from './rsm/RSMHourPlot';
import { LayoutNav } from '../app/LayoutNav';
import { IMFPlot } from '../plots/time/IMF';
import { SWPlasmaPlot } from '../plots/time/SW';
import { XraysPlot } from '../plots/time/XRays';
import { GeomagnPlot } from '../plots/time/Geomagn';
import { EventsCheckbox } from '../components/Checkbox';

const panels: EventsPanel<any>[] = [
	IMFPlot,
	SWPlasmaPlot,
	GeomagnPlot,
	XraysPlot,
	SatParticlesPlot,
	RSMPlot,
	CustomPlot,
	SatParticlesPlot,
	RSMHourPlot,
	{
		name: 'Empty',
		Panel: () => null,
	},
];

function PanelWrapper<T>({ panel }: { panel: EventsPanel<T> }) {
	return (
		<div className={cn('h-full select-none overflow-clip', !panel.name?.includes('Table') && 'border')}>
			<panel.Panel />
		</div>
	);
}

function MenuWrapper<T>({ panel, params, set, setParams, Checkbox }: { panel: EventsPanel<T> } & ContextMenuProps<any>) {
	const { resetLayout } = useLayoutsStore();
	const details = (useContextMenuStore((state) => state.menu?.detail) as LayoutsMenuDetails | null) ?? null;
	const { realtimeWindow, set: setSetting } = useCrowSettings();
	const { Menu, isPlot } = panel;
	return (
		<div className="flex flex-col gap-1 items-end select-none [&>*]:w-full [&>*]:text-right [&>*]:justify-end">
			<div>
				Window, h:
				<Input
					className="w-15 ml-1"
					type="number"
					min="48"
					max="2400"
					step={12}
					defaultValue={realtimeWindow}
					onChange={(e) => !isNaN(e.target.valueAsNumber) && setSetting('realtimeWindow', e.target.valueAsNumber)}
				/>
			</div>
			<div className="flex gap-3">
				<EventsCheckbox label="grid" k="showGrid" />
				<EventsCheckbox label="markers" k="showMarkers" />
				<EventsCheckbox label="legend" k="showLegend" />
			</div>
			{Menu && <div className="separator" />}
			{Menu && <Menu {...{ params, set, setParams, Checkbox }} />}
			{isPlot && (
				<>
					<div className="separator" />
					{details && (
						<Button className="h-7" onClick={() => renderPlotInANewTab(details.nodeId)}>
							Open image in new tab
						</Button>
					)}
				</>
			)}
			<div className="separator" />
			<LayoutNav />
			<Button onClick={() => resetLayout()}>Reset layout</Button>
		</div>
	);
}

const eventsPanels = Object.fromEntries(
	panels.map((p) => [
		p.name,
		{
			...p,
			defaultParams: { ...defaultPlotParams, ...p.defaultParams, solarTime: false },
			Panel: () => <PanelWrapper panel={p as any} />,
			Menu: (props: any) => <MenuWrapper panel={p as any} {...props} />,
		},
	]),
);

export default function RealtimeApp() {
	useRealtimeUpdater();

	return (
		<>
			<title>Realtime view</title>
			<CrowController />
			<AppLayout panels={eventsPanels} />
		</>
	);
}
