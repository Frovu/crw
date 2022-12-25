import uPlot from 'uplot';
import { axisDefaults, basicDataQuery, BasicPlot, BasicPlotParams, color, customTimeSplits, drawMagneticClouds, drawOnsets } from './plotUtil';

type IMFParams = BasicPlotParams & {
	showVector?: boolean,
};

function imfPlotOptions(size: { width: number, height: number }, params: IMFParams): uPlot.Options {
	return {
		...size,
		padding: [10, 4, 0, 0],
		legend: { show: params.interactive },
		cursor: {
			show: params.interactive,
			drag: { x: false, y: false, setScale: false }
		},
		hooks: {
			drawAxes: [u => (params.clouds?.length) && drawMagneticClouds(u, params.clouds)],
			draw: [u => (params.onsets?.length) && drawOnsets(u, params.onsets)],
		},
		axes: [
			{
				...axisDefaults(),
				size: 40,
				...customTimeSplits()
			},
			{
				...axisDefaults(),
				grid: { show: false },
				scale: 'speed',
				// values: (u, vals) => vals.map(v => v.toFixed(vals[0] <= -10 ? 0 : 1)),
			},
			{
				...axisDefaults(),
				scale: 'imf',
			},
			{
				...axisDefaults(),
				scale: 'vector',
			}
		],
		scales: {
		},
		series: [
			{ label: 't' },
			{
				label: 'v,km/s',
				scale: 'speed',
				stroke: color('acid'),
				points: { show: false }
			},
			{
				label: '|B|,nT',
				scale: 'imf',
				stroke: color('purple'),
				points: { show: false }
			},
			{
				label: 'Bx,nT',
				scale: 'vector',
				stroke: color('blue'),
				points: { show: false }
			},
			{
				label: 'By,nT',
				scale: 'vector',
				stroke: color('green'),
				points: { show: false }
			},
			{
				label: 'Bz,nT',
				scale: 'vector',
				stroke: color('magenta'),
				points: { show: false }
			}
		]
	};
}

export default function PlotIMF(params: IMFParams) {
	return (<BasicPlot {...{
		queryKey: ['IMF', params.interval],
		queryFn: () => basicDataQuery('api/omni', params.interval, ['time', 'sw_speed', 'imf_scalar', 'imf_x', 'imf_y', 'imf_z']),
		optionsFn: size => imfPlotOptions(size, params)
	}}/>);
}