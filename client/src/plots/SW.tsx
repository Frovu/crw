import uPlot from 'uplot';
import { markersPaths } from './plotPaths';
import { axisDefaults, basicDataQuery, BasicPlot, BasicPlotParams, color, customTimeSplits, drawCustomLabels, drawMagneticClouds, drawOnsets, superScript } from './plotUtil';

type SWParams = BasicPlotParams & {
	useTemperatureIndex?: boolean,
};

function plotOptions(params: SWParams) {
	return (size: { width: number, height: number }, markers: boolean, grid: boolean): uPlot.Options => {
		return {
			...size,
			padding: [7, 0, 12, 0],
			legend: { show: params.interactive },
			cursor: {
				show: params.interactive,
				drag: { x: false, y: false, setScale: false }
			},
			hooks: {
				drawAxes: [u => (params.clouds?.length) && drawMagneticClouds(u, params.clouds)],
				draw: [
					u => (params.onsets?.length) && drawOnsets(u, params.onsets),
					u => drawCustomLabels({ temp: params.useTemperatureIndex ? 'Tp index' : 'Tp, K', y: 'Dp, N/cm³ & beta' })(u)
				],
			},
			axes: [
				{
					...axisDefaults(grid),
					...customTimeSplits(params),
				},
				{
					...axisDefaults(grid),
					label: '',
					scale: 'y',
					side: 1,
				},
				{
					...axisDefaults(grid),
					label: '',
					scale: 'temp',
					grid: { show: false },
					...(!params.useTemperatureIndex && { values: (u, vals) => vals.map(v => Math.log10(v) % 1 === 0 ? '10' + superScript(Math.log10(v)) : '') })
				},
			],
			scales: {
				y: {
				},
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
					label: 'Tp',
					scale: 'temp',
					stroke: color('cyan'),
					width: 2,
					points: {
						stroke: color('cyan'),
						fill: color('cyan', .8),
						show: markers,
						paths: markersPaths('diamond', 6)
					},
				},
				{
					label: 'beta',
					scale: 'y',
					stroke: color('magenta'),
					width: 2,
					points: {
						stroke: color('magenta'),
						fill: color('magenta'),
						show: markers,
						paths: markersPaths('square', 4)
					},
				},
				{
					label: 'Dp',
					scale: 'y',
					stroke: color('peach'),
					width: 2,
					points: {
						stroke: color('peach'),
						fill: color('peach'),
						show: markers,
						paths: markersPaths('circle', 4)
					},
				},
			]
		};
	};
}

export default function PlotSW(params: SWParams) {
	const tColumn = params.useTemperatureIndex ? 'temperature_idx' : 'sw_temperature';
	return (<BasicPlot {...{
		queryKey: ['SW', params.interval, params.useTemperatureIndex],
		queryFn: () => basicDataQuery('api/omni/', params.interval, ['time', tColumn, 'sw_density', 'plasma_beta']),
		optionsFn: plotOptions(params)
	}}/>);
}