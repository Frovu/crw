
import { useEventsSettings, type PanelParams } from '../../events/events';
import { useFeidCursor, useSource } from '../../events/eventsState';
import type { ContextMenuProps } from '../../layout';
import { apiGet } from '../../util';
import { type BasicPlotParams, basicDataQuery } from '../basicPlot';
import BasicPlot from '../BasicPlot';
import { color, scaled, superScript } from '../plotUtil';

const defaultParams = {
}

export type SatXraysParams = BasicPlotParams & Partial<typeof defaultParams>;

export function XraysContextMenu({ params, setParams }: ContextMenuProps<Partial<SatXraysParams>>) {
	// const { mode } = { ...defaultParams, ...params };

	return <div className='Group'>

	</div>;
}

export default function XraysPlot({ params }: { params: SatXraysParams }) {
	const { showGrid, showTimeAxis } = { ...defaultParams, ...params };
	const { plotOffset } = useEventsSettings();
	const erupt = useSource('sources_erupt');
	const { start: feidTime } = useFeidCursor();
	const interval = plotOffset.map(o => new Date((feidTime?.getTime() ?? 0) + o * 36e5)) as [Date, Date];

	return (<BasicPlot {...{
		queryKey: ['satxrays'],
		queryFn: () => basicDataQuery('omni/xrays', interval, ['time', 's', 'l']),
		params: {
			...params,
			interval,
			onsets: [],
			clouds: [],
		},
		axes: () => [{
			label: 'y',
			fullLabel: 'X-Ray, W/m^2',
			distr: 3,
			minMax: [1e-8, 1.5e-4],
			ticks: { show: false },
			grid: { filter: (u, splits) => splits.map(s => Math.log10(s) % 1 === 0 ? s : null) },
			values: (u, vals) => vals.map(v => Math.log10(v) % 1 === 0 ? ['A', 'B', 'C', 'M', 'X'][Math.log10(v)+8] ?? '' : '')
		}],
		series: () => [{
			label: 's',
			scale: 'y',
			legend: '0.5 - 4 Å',
			stroke: color('green'),
		}, {
			label: 'l',
			scale: 'y',
			legend: '1 - 8 Å',
			stroke: color('cyan'),
		}]
	}}/>);
}