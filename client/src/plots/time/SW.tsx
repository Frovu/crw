import { BasicPlot, basicDataQuery } from '../BasicPlot';
import { BasicPlotParams, color, superScript } from '../plotUtil';

export type SWParams = BasicPlotParams & {
	useTemperatureIndex: boolean,
	showBeta: boolean
};

export default function PlotSW({ params }: { params: SWParams }) {
	const tColumn = params.useTemperatureIndex ? 'temperature_idx' : 'sw_temperature';
	return (<BasicPlot {...{
		queryKey: ['SW', params.interval, params.useTemperatureIndex],
		queryFn: async () => {
			const data = await basicDataQuery('omni', params.interval, ['time', 'sw_density', 'plasma_beta', tColumn]);
			return data?.concat([Array(data[0].length).fill(.5)]) ?? null;
		},
		params,
		options: params.useTemperatureIndex ? {
			bands: [{
				series: [3,4],
				fill: color('cyan', .7),
				dir: 1
			}]
		} : {},
		axes: [
			{
				label: 'Dp',
				fullLabel: 'Dp, N/cm³' + (params.showBeta ? ' & beta' : ''),
				position: [1/8, 1],
				whole: true,
				side: 1,
			},
			{
				label: 'Tp',
				...(params.useTemperatureIndex && { minMax: [0, null] }),
				fullLabel: params.useTemperatureIndex ? 'Tp index' : 'Tp, K',
				showGrid: false,
				distr: params.useTemperatureIndex ? 1 : 3,
				...(!params.useTemperatureIndex && { values: (u, vals) => vals.map(v => Math.log10(v) % 1 === 0 ? '10' + superScript(Math.log10(v)) : '') })
			},
		],
		series: [
			{
				label: 'Dp',
				legend: 'Proton density, N/cm^3',
				scale: 'Dp',
				marker: 'circle',
				stroke: color('peach'),
				width: 2,
			},
			{
				show: !!params.showBeta,
				label: 'beta',
				legend: 'Plasma beta',
				scale: 'Dp',
				marker: 'square',
				stroke: color('magenta'),
				width: 1,
			},
			{
				label: 'Tp',
				legend: params.useTemperatureIndex ? 'Temperature index' : 'Proton temperature, K',
				scale: 'Tp',
				marker: 'diamond',
				stroke: color('cyan'),
				width: 2,
			},
			{
				scale:  params.useTemperatureIndex ? 'Tp' : 'y'
			}
		]
	}}/>);
}