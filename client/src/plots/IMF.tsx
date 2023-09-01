import uPlot from 'uplot';
import { markersPaths } from './plotPaths';
import { axisDefaults, basicDataQuery, BasicPlot, BasicPlotParams, color, customTimeSplits } from './plotUtil';

type IMFParams = BasicPlotParams & {
	showBz?: boolean,
	showBxBy?: boolean,
};

function imfPlotOptions(params: IMFParams): Partial<uPlot.Options> {
	const filterV = (u: uPlot, splits: number[]) => splits.map(sp => sp > (u.scales.speed.max! - u.scales.speed.min!) / 2 + u.scales.speed.min! ? sp : null);
	return {
		axes: [
			{
				...axisDefaults(params.showGrid),
				...customTimeSplits(params)
			},
			{
				...axisDefaults(false),
				label: '',
				scale: 'speed',
				side: 1,
				ticks: { ...axisDefaults(false).ticks, filter: filterV },
				filter: filterV,
				values: (u, vals) => vals.map(v => v === 1000 ? '1e3' : v),
			},
			{
				...axisDefaults(params.showGrid),
				label: '',
				scale: 'imf',
				incrs: [1, 2, 3, 5, 10, 20, 25, 50, 100],
			},
			{
				...axisDefaults(params.showGrid),
				scale: 'vector',
			}
		],
		scales: {
			imf: {
				range: (u, min, max) => [min - 1, Math.max(max, 20) * 3 / 2]
			},
			speed: {
				range: (u, min, max) => [min - (max-min), max + 3]
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
				points: {
					show: params.showMarkers,
					stroke: color('acid'),
					fill: color('acid'),
					paths: markersPaths('diamond', 6)
				},
			},
			{
				label: '|B|',
				scale: 'imf',
				stroke: color('purple'),
				width: 2,
				points: {
					show: params.showMarkers,
					stroke: color('purple'),
					fill: color('purple'),
					paths: markersPaths('circle', 6)
				},
			},
			...[['Bx', 'cyan', 'triangleDown'], ['By', 'green', 'triangleUp'], ['Bz', 'magenta', 'square']].map(([label, stroke, paths]) => ({
				show: label === 'Bz' ? params.showBz : params.showBxBy,
				label,
				scale: 'imf',
				stroke: color(stroke),
				points: {
					legendShapes: paths,
					show: params.showMarkers,
					stroke: color(stroke),
					fill: color(stroke, .9),
					paths: markersPaths(paths, 7)
				},
			}))
		]
	};
}

export default function PlotIMF(params: IMFParams) {
	return (<BasicPlot {...{
		queryKey: ['IMF', params.interval],
		queryFn: () => basicDataQuery('api/omni/', params.interval, ['time', 'sw_speed', 'imf_scalar', 'imf_x', 'imf_y', 'imf_z']),
		options: imfPlotOptions(params),
		params,
		labels: { imf: `IMF(|B|${params.showBxBy?',Bx,By':''}${params.showBz?',Bz':''}), nT`, speed: ['Vsw, km/s', -1 / 4, 16] },
		legend: [{
			'Vsw': 'Vsw, km/s',
			'|B|': 'IMF |B|, nT',
			'Bx': 'IMF  Bx, nT',
			'By': 'IMF  By, nT',
			'Bz': 'IMF  Bz, nT',
		}, {
			'Vsw': 'diamond',
			'|B|': 'circle',
			'Bx': 'triangleDown',
			'By': 'triangleUp',
			'Bz': 'square',
		}]
	}}/>);
}