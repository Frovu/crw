import uPlot from 'uplot';
import { BasicPlot, BasicPlotParams, axisDefaults, basicDataQuery, color, customTimeSplits, drawCustomLabels, drawMagneticClouds, drawOnsets } from './plotUtil';
import { tracePaths, markersPaths } from './plotPaths';

function anisotropyPlotOptions(params: BasicPlotParams): Partial<uPlot.Options> {
	const filterAxy = (u: uPlot, splits: number[]) => splits.map(sp => sp < u.scales.az.max! / 3 + u.scales.az.min! ? sp : null);
	return {
		padding: [10, 0, params.paddingBottom ?? 0, 0],
		legend: { show: params.interactive },
		cursor: {
			show: params.interactive,
			drag: { x: false, y: false, setScale: false }
		},
		hooks: {
			drawAxes: [
				u => (params.clouds?.length) && drawMagneticClouds(u, params.clouds),
				u => (params.onsets?.length) && drawOnsets(u, params.onsets),
			],
			draw: [
				u => drawCustomLabels({ a0: ['A0(GSM) var, %', u.height / 5], az: ['Az(GSM) var, %', u.height / 4] })(u)
			],
		},
		axes: [
			{
				...axisDefaults(params.showGrid),
				...customTimeSplits()
			},
			{
				...axisDefaults(params.showGrid),
				label: '',
				scale: 'a0',
				incrs: [1, 2, 2.5, 5, 10, 20],
				filter: (u, splits) => splits.map(sp => sp <= 0 ? sp : null),
				ticks: {
					...axisDefaults(params.showGrid).ticks,
					filter: (u, splits) => splits.map(sp => sp <= 0 ? sp : null)
				}
			},
			{
				side: 1,
				...axisDefaults(false),
				label: '',
				scale: 'az',
				incrs: [.5, 1, 2, 2.5, 5, 10, 20],
				ticks: { ...axisDefaults(false).ticks, filter: filterAxy },
				filter: filterAxy
			},
		],
		scales: {
			x: { },
			a0: {
				range: (u, min, max) => [min, -1.5 * min + .5]
			},
			az: {
				range: (u, min, max) => [Math.min(0, min) - 1, (Math.max(max, 3.5) - min) * 2 - min + 3]
			}
		},
		series: [
			{ },
			{
				scale: 'a0',
				label: 'A0(GSM)',
				stroke: color('peach'),
				width: 2,
				points: {
					show: params.showMarkers,
					stroke: color('peach'),
					fill: color('peach', .8),
					paths: markersPaths('diamond', 6)
				}
			},
			{
				scale: 'az',
				label: 'Az(GSM)',
				stroke: color('cyan'),
				width: 2,
				points: {
					show: params.showMarkers,
					stroke: color('cyan'),
					fill: color('cyan', .8),
					paths: markersPaths('triangleUp', 6)
				}
			},
			{
				stroke: color('magenta'),
				width: 2,
				paths: tracePaths(2, params.showMarkers),
				points: { show: false }
			}
		]
	};
}

export default function PlotGSMAnisotropy(params: BasicPlotParams) {
	return (<BasicPlot {...{
		queryKey: ['GSM', params.interval],
		queryFn: async () => {
			const data = await basicDataQuery('api/gsm/', params.interval, ['time', 'a10', 'az', 'ax', 'ay']);
			if (!data) return null;
			return data;
		},
		options: anisotropyPlotOptions(params)
	}}/>);
}