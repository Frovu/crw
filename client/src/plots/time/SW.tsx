import { basicDataQuery, BasicPlot, BasicPlotParams, color, superScript } from '../plotUtil';

export type SWParams = BasicPlotParams & {
	useTemperatureIndex: boolean,
	showBeta: boolean
};

export default function PlotSW(params: SWParams) {
	const tColumn = params.useTemperatureIndex ? 'temperature_idx' : 'sw_temperature';
	return (<BasicPlot {...{
		queryKey: ['SW', params.interval, params.useTemperatureIndex],
		queryFn: () => basicDataQuery('api/omni/', params.interval, ['time', 'sw_density', 'plasma_beta', tColumn]),
		params,
		axes: [
			{
				label: 'y',
				fullLabel: 'Dp, N/cm³' + (params.showBeta ? ' & beta' : ''),
				side: 1,
			},
			{
				label: 'temp',
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
				legend: 'Plasma beta',
				scale: 'y',
				marker: 'circle',
				stroke: color('peach'),
				width: 2,
			},
			{
				show: !!params.showBeta,
				label: 'beta',
				legend: 'Proton density, N/cm^3',
				scale: 'y',
				marker: 'square',
				stroke: color('magenta'),
				width: 2,
			},
			{
				label: 'Tp',
				legend: params.useTemperatureIndex ? 'Temperature index' : 'Proton temperature, K',
				scale: 'temp',
				marker: 'diamond',
				stroke: color('cyan'),
				width: 2,
			},
		]
	}}/>);
}