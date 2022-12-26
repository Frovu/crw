import uPlot from 'uplot';
import { axisDefaults, basicDataQuery, BasicPlot, BasicPlotParams, color, customTimeSplits, drawCustomLabels, drawMagneticClouds, drawOnsets } from './plotUtil';

type IMFParams = BasicPlotParams & {
	showVector?: boolean,
};

function imfPlotOptions(size: { width: number, height: number }, params: IMFParams): uPlot.Options {
	const filterV = (u: uPlot, splits: number[]) => splits.map(sp => sp > u.scales.speed.max! / 2 + u.scales.speed.min! ? sp : null);
	return {
		...size,
		padding: [10, 4, 4, 0],
		legend: { show: params.interactive },
		cursor: {
			show: params.interactive,
			drag: { x: false, y: false, setScale: false }
		},
		hooks: {
			drawAxes: [u => (params.clouds?.length) && drawMagneticClouds(u, params.clouds)],
			draw: [
				u => (params.onsets?.length) && drawOnsets(u, params.onsets),
				u => drawCustomLabels({ imf: (params.showVector ?'IMF(|B|,Bx,By,Bz)':'IMF |B|') + ', nT', speed: ['Vsw, km/s', 16 + -u.height / 4] })(u)
			],
		},
		axes: [
			{
				...axisDefaults(),
				...customTimeSplits()
			},
			{
				...axisDefaults(),
				grid: { show: false },
				label: '',
				scale: 'speed',
				side: 1,
				ticks: { ...axisDefaults().ticks, filter: filterV },
				filter: filterV,
				values: (u, vals) => vals.map(v => v === 1000 ? '1e3' : v),
			},
			{
				...axisDefaults(),
				label: '',
				scale: 'imf',
				incrs: [1, 2, 3, 5, 10, 20, 25, 50, 100],
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
				label: 'Vsw',
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
			...[['Bx', 'cyan'], ['By', 'green'], ['Bz', 'magenta']].map(([label, stroke]) => ({
				show: params.showVector,
				label,
				scale: 'imf',
				stroke: color(stroke),
				points: { show: false },
			}))
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