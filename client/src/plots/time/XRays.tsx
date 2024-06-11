
import { useEventsSettings, type PanelParams } from '../../events/events';
import { useFeidCursor, useSource } from '../../events/eventsState';
import type { ContextMenuProps } from '../../layout';
import { apiGet } from '../../util';
import { type BasicPlotParams, basicDataQuery } from '../basicPlot';
import BasicPlot from '../BasicPlot';
import { axisDefaults, color, measureDigit, scaled, superScript } from '../plotUtil';
import { useSolarPlotContext } from './solar';

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
	const { interval, flares } = useSolarPlotContext();

	return (<BasicPlot {...{
		queryKey: ['satxrays'],
		queryFn: () => basicDataQuery('omni/xrays', interval, ['time', 'l', 's']),
		params: {
			...params,
			interval,
			onsets: [],
			clouds: [],
		},
		options: () => ({
			padding: [scaled(16), scaled(6), 0, 0],
		}),
		axes: () => [{
			...axisDefaults(showGrid, (u, splits) => splits.map(s => Math.log10(s) % 1 === 0 ? s : null)),
			label: 'y',
			fullLabel: 'X-Ray, W/m^2',
			distr: 3,
			gap: scaled(4),
			size: measureDigit().width + measureDigit().height + scaled(4),
			minMax: [null, 1e-5],
			values: (u, vals) => vals.map(v => Math.log10(v) % 1 === 0 ? ['A', 'B', 'C', 'M', 'X'][Math.log10(v)+8] ?? '' : '')
		}],
		series: () => [{
			label: 'l',
			scale: 'y',
			legend: '1 - 8 Å',
			stroke: color('magenta'),
		}, {
			label: 's',
			scale: 'y',
			legend: '.5 - 4 Å',
			stroke: color('purple'),
		}]
	}}/>);
}