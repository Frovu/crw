import uPlot from 'uplot';
import { markersPaths } from './plotPaths';
import { axisDefaults, basicDataQuery, BasicPlot, BasicPlotParams, color, customTimeSplits, superScript } from './plotUtil';

export type SWParams = BasicPlotParams & {
	useTemperatureIndex: boolean,
	showBeta: boolean
};

function plotOptions(params: SWParams): Partial<uPlot.Options> {
	return {
		axes: [
			{
				...axisDefaults(params.showGrid),
				...customTimeSplits(params),
			},
			{
				...axisDefaults(params.showGrid),
				label: '',
				scale: 'y',
				side: 1,
			},
			{
				...axisDefaults(params.showGrid),
				label: '',
				scale: 'temp',
				grid: { show: false },
				...(!params.useTemperatureIndex && { values: (u, vals) => vals.map(v => Math.log10(v) % 1 === 0 ? '10' + superScript(Math.log10(v)) : '') })
			},
		],
		scales: {
			y: { },
			temp: {
				distr: params.useTemperatureIndex ? 1 : 3
			}
		},
		series: [
			{
				label: 'time',
				value: '{YYYY}-{MM}-{DD} {HH}:{mm}'
			},
			{
				label: 'Dp',
				scale: 'y',
				stroke: color('peach'),
				width: 2,
				points: {
					show: params.showMarkers,
					stroke: color('peach'),
					fill: color('peach'),
					paths: markersPaths('circle', 6)
				},
			},
			{
				show: !!params.showBeta,
				label: 'beta',
				scale: 'y',
				stroke: color('magenta'),
				width: 2,
				points: {
					show: params.showMarkers,
					stroke: color('magenta'),
					fill: color('magenta'),
					paths: markersPaths('square', 6)
				},
			},
			{
				label: 'Tp',
				scale: 'temp',
				stroke: color('cyan'),
				width: 2,
				points: {
					show: params.showMarkers,
					stroke: color('cyan'),
					fill: color('cyan', .8),
					paths: markersPaths('diamond', 6)
				},
			},
		]
	};
}

export default function PlotSW(params: SWParams) {
	const tColumn = params.useTemperatureIndex ? 'temperature_idx' : 'sw_temperature';
	return (<BasicPlot {...{
		queryKey: ['SW', params.interval, params.useTemperatureIndex],
		queryFn: () => basicDataQuery('api/omni/', params.interval, ['time', 'sw_density', 'plasma_beta', tColumn]),
		params, options: plotOptions(params),
		labels: { temp: params.useTemperatureIndex ? 'Tp index' : 'Tp, K', y: 'Dp, N/cm³' + (params.showBeta ? ' & beta' : '') },
		legend: [{
			'Tp': params.useTemperatureIndex ? 'Temperature index' : 'Proton temperature, K',
			'Dp': 'Proton density, N/cm^3',
			'beta': 'Plasma beta',
		 }, {
			'Tp': 'diamond',
			'Dp': 'circle',
			'beta': 'square',
		}]
	}}/>);
}