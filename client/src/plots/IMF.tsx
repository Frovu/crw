import uPlot from 'uplot';
import { axisDefaults, basicDataQuery, BasicPlot, BasicPlotParams, color, customTimeSplits, drawMagneticClouds, drawOnsets } from './plotUtil';

type IMFParams = BasicPlotParams & {
	showVector?: boolean,
};

function imfPlotOptions(size: { width: number, height: number }, params: IMFParams): uPlot.Options {
	const filterV = (u: uPlot, splits: number[]) => splits.map(sp => sp > u.scales.speed.max! / 2 - 150 + u.scales.speed.min! ? sp : null);
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
				...customTimeSplits()
			},
			{
				...axisDefaults(),
				grid: { show: false },
				scale: 'speed',
				side: 1,
				ticks: { ...axisDefaults().ticks, filter: filterV },
				filter: filterV,
				values: (u, vals) => {
					const vv = vals.map(v => v?.toFixed(0));
					vv.splice(vals.findIndex(v => v), 1, 'V,\n1e3\nm/s');
					return vv;
				},
			},
			{
				...axisDefaults(),
				label: '|B|,Bx,By,Bz, nT',
				scale: 'imf',
			},
			{
				...axisDefaults(),
				scale: 'vector',
			}
		],
		scales: {
			imf: {
				range: (u, min, max) => [min, max * 3 / 2]
			},
			speed: {
				range: (u, min, max) => [min - (max-min), max]
			}
		},
		series: [
			{
				label: 't',
				value: '{YYYY}-{MM}-{DD} {HH}:{mm}'
			},
			{
				label: 'v',
				scale: 'speed',
				stroke: color('acid'),
				width: 2,
				points: { show: false },
			},
			{
				label: '|B|',
				scale: 'imf',
				stroke: color('purple'),
				width: 2,
				points: { show: false },
			},
			{
				label: 'Bx',
				scale: 'imf',
				stroke: color('blue'),
				points: { show: false },
			},
			{
				label: 'By',
				scale: 'imf',
				stroke: color('green'),
				points: { show: false },
			},
			{
				label: 'Bz',
				scale: 'imf',
				stroke: color('red'),
				points: { show: false },
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