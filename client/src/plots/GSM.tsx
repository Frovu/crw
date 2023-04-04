import uPlot from 'uplot';
import { markersPaths } from './plotPaths';
import { axisDefaults, basicDataQuery, BasicPlot, BasicPlotParams, color, customTimeSplits, drawCustomLabels, drawMagneticClouds, drawOnsets } from './plotUtil';

type GSMParams = BasicPlotParams & {
	subtractTrend: boolean,
	maskGLE: boolean,
	showAz: boolean,
	useA0m: boolean
};

function gsmPlotOptions(params: GSMParams): Partial<uPlot.Options> {
	const filterAxy = (u: uPlot, splits: number[]) => splits.map(sp => sp < u.scales.axy.max! / 2 + u.scales.axy.min! ? sp : null);
	const az = params.showAz;
	const a0m = params.useA0m;
	return {
		padding: [10, 0, params.paddingBottom ?? 0, 0],
		legend: { show: params.interactive },
		cursor: {
			show: params.interactive,
			drag: { x: false, y: false, setScale: false }
		},
		hooks: {
			drawAxes: [u => (params.clouds?.length) && drawMagneticClouds(u, params.clouds)],
			draw: [
				u => (params.onsets?.length) && drawOnsets(u, params.onsets),
				u => drawCustomLabels({ var: `A0${a0m?'m':''}(GSM) var, %`, axy: ['Axy' + (az ? ',Az' : '') + ',%', u.height / 4] })(u)
			],
		},
		axes: [
			{
				...axisDefaults(params.showGrid),
				...customTimeSplits()
			},
			{
				...axisDefaults(false),
				side: 1,
				label: '',
				scale: 'axy',
				space: 26,
				incrs: [.5, 1, 2, 2.5, 5, 10, 20],
				ticks: { ...axisDefaults(false).ticks, filter: filterAxy },
				filter: filterAxy,
				values: (u, vals) => vals.map(v => v?.toFixed(v > 0 && vals[1] - vals[0] < 1 ? 1 : 0)),
			},
			{
				...axisDefaults(params.showGrid),
				label: '',
				scale: 'var',
				space: 36,
				// filter: (u, splits) => splits.map(sp => sp % 1 === 0 ? sp : null),
				values: (u, vals) => vals.map(v => v?.toFixed()),
			},
		],
		scales: {
			x: { },
			var: {
				range: (u, min, max) => [min - 2, max + .5]
			},
			axy: {
				range: (u, min, max) => [Math.min(0, min), (Math.max(max, 3.5) - min) * 2 - min]
			}
		},
		series: [
			{ },
			{
				scale: 'axy',
				label: 'Axy',
				stroke: color('magenta', .8),
				fill: color('magenta', .3),
				paths: uPlot.paths.bars!({ size: [.4, 16] }),
				points: { show: false }
			},
			{
				show: az,
				scale: 'axy',
				label: 'Az',
				stroke: color('purple'),
				fill: color('purple'),
				paths: uPlot.paths.bars!({ size: [.2, 10] }),
				points: { show: false }
			},
			...['A0', 'A0m'].map(what => ({
				show: what === (a0m ? 'A0m' : 'A0'),
				scale: 'var',
				label: what + '(GSM)',
				stroke: color('green'),
				width: 2,
				points: {
					show: params.showMarkers,
					stroke: color('green'),
					fill: color('green', .8),
					paths: markersPaths('diamond', 6)
				}
			})),
		]
	};
}

export default function PlotGSM(params: GSMParams) {
	return (<BasicPlot {...{
		queryKey: ['GSM', params.interval, params.subtractTrend, params.maskGLE],
		queryFn: () => basicDataQuery('api/gsm/', params.interval, ['time', 'axy', 'az', 'a10', 'a10m'], {
			mask_gle: params.maskGLE ? 'true' : 'false', // eslint-disable-line camelcase
			subtract_trend: params.subtractTrend ? 'true' : 'false' // eslint-disable-line camelcase
		}),
		options: gsmPlotOptions(params)
	}}/>);
}