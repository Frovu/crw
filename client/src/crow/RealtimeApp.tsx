import AppLayout from '../app/Layout';
import type { ContextMenuProps } from '../app/layout';
import { RSMPlot } from '../crow/rsm/CirclesPlot';
import type { EventsPanel } from '../events/core/util';
import { defaultPlotParams } from '../plots/common/types';
import { CustomPlot } from '../plots/time/CustomPlot';
import { SatParticlesPlot } from '../plots/time/Particles';
import { XraysPlot } from '../plots/time/XRays';
import { cn } from '../util';

const panels: EventsPanel<any>[] = [
	RSMPlot,
	CustomPlot,
	SatParticlesPlot,
	XraysPlot,
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
	const { Menu } = panel;
	return (
		<div className="flex flex-col gap-1 items-end select-none [&>*]:w-full [&>*]:text-right [&>*]:justify-end">
			{Menu && <Menu {...{ params, set, setParams, Checkbox }} />}
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
			Menu: (props: any) => <MenuWrapper panel={p as any} {...props} />,
		},
	]),
);

export default function RealtimeApp() {
	return (
		<>
			<title>Realtime view</title>
			<AppLayout panels={eventsPanels} />
		</>
	);
}
