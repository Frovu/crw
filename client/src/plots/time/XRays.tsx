import { type BasicPlotParams, basicDataQuery } from '../basicPlot';
import BasicPlot from '../BasicPlot';
import { axisDefaults, color, scaled } from '../plotUtil';
import { flaresOnsetsPlugin, useSolarPlotContext } from './solar';

export const defaultSatXraysParams = {
	showShortXrays: true
};

export type SatXraysParams = BasicPlotParams & typeof defaultSatXraysParams;

export default function XraysPlot({ params }: { params: SatXraysParams }) {
	const { showGrid, showShortXrays } = params;
	const { interval, flares, focusTime } = useSolarPlotContext();

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
			padding: [scaled(8), scaled(6), 0, 0],
			plugins: [flaresOnsetsPlugin({ params, show: true, flares, focusTime })]
		}),
		axes: () => [{
			...axisDefaults(showGrid, (u, splits) => splits.map(s => Math.log10(s) % 1 === 0 ? s : null)),
			label: 'y',
			fullLabel: 'X-Ray, W/m²',
			distr: 3,
			gap: scaled(4),
			minMax: [null, 1e-5],
			values: (u, vals) => vals.map(v => Math.log10(v) % 1 === 0 ? ['A', 'B', 'C', 'M', 'X'][Math.log10(v)+8] ?? '' : '')
		}],
		series: () => [{
			label: 'l',
			scale: 'y',
			legend: '1 - 8 Å',
			stroke: color('magenta'),
		}, {
			show: showShortXrays,
			label: 's',
			scale: 'y',
			legend: '.5 - 4 Å',
			stroke: color('purple'),
		}]
	}}/>);
}