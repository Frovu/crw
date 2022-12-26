import uPlot from 'uplot';
import { axisDefaults, basicDataQuery, BasicPlot, BasicPlotParams, color, customTimeSplits, drawCustomLabels, drawMagneticClouds, drawOnsets } from './plotUtil';

type SWParams = BasicPlotParams & {
	useTemperatureIndex?: boolean,
};

function plotOptions(size: { width: number, height: number }, params: SWParams): uPlot.Options {
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
				u => drawCustomLabels({ temp: 'Tp, K', y: 'Dp, N/cm^3 & beta' })(u)
			],
		},
		axes: [
			{
				...axisDefaults(),
				...customTimeSplits(params),
			},
			{
				...axisDefaults(),
				label: '',
				scale: 'y',
				side: 1,
			},
			{
				...axisDefaults(),
				label: '',
				scale: 'temp',
				grid: { show: false },
				values: (u, vals) => vals.map(v => Math.log10(v) % 1 === 0 ? '1e' + Math.log10(v) : '')
			},
		],
		scales: {
			y: {
			},
			temp: {
				distr: 3
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
				points: { show: false },
			},
			{
				label: 'beta',
				scale: 'y',
				stroke: color('magenta'),
				width: 2,
				points: { show: false },
			},
			{
				label: 'Dp',
				scale: 'y',
				stroke: color('peach'),
				width: 2,
				points: { show: false },
			},
		]
	};
}

export default function PlotSW(params: SWParams) {
	return (<BasicPlot {...{
		queryKey: ['SW', params.interval],
		queryFn: () => basicDataQuery('api/omni', params.interval, ['time', 'sw_temperature', 'sw_density', 'plasma_beta']),
		optionsFn: size => plotOptions(size, params)
	}}/>);
}