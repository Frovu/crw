import uPlot from 'uplot';
import { axisDefaults, basicDataQuery, BasicPlot, BasicPlotParams, color, customTimeSplits, drawCustomLabels, drawMagneticClouds, drawOnsets } from './plotUtil';

type GSMParams = BasicPlotParams & {
	showAz?: boolean
};

function gsmPlotOptions(size: { width: number, height: number }, params: GSMParams): uPlot.Options {
	const filterAxy = (u: uPlot, splits: number[]) => splits.map(sp => sp < u.scales.axy.max! / 2 + u.scales.axy.min! ? sp : null);
	const az = params.showAz;
	return {
		...size,
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
				u => drawCustomLabels({ var: 'A0(GSM) var, %', axy: ['Axy' + (az ? ',Az' : '') + ',%', u.height / 4] })(u)
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
				side: 1,
				label: '',
				scale: 'axy',
				space: 26,
				incrs: [.5, 1, 2, 2.5, 5, 10, 20],
				ticks: { ...axisDefaults().ticks, filter: filterAxy },
				filter: filterAxy,
				values: (u, vals) => vals.map(v => v?.toFixed(v > 0 && vals[1] - vals[0] < 1 ? 1 : 0)),
			},
			{
				...axisDefaults(),
				label: '',
				scale: 'var',
				space: 36,
				filter: (u, splits) => splits.map(sp => sp % 1 === 0 ? sp : null),
				values: (u, vals) => vals.map(v => v?.toFixed()),
			},
		],
		scales: {
			x: { },
			var: {
				key: 'var'
			},
			axy: {
				key: 'axy',
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
				stroke: color('purple', .8),
				fill: color('purple', .6),
				paths: uPlot.paths.bars!({ size: [.2, 10] }),
				points: { show: false }
			},
			{
				scale: 'var',
				label: 'A0(GSM)',
				stroke: color('cyan'),
				width: 2,
				points: { show: false }
			},
		]
	};
}

export default function PlotGSM(params: GSMParams) {
	return (<BasicPlot {...{
		queryKey: ['GSM', params.interval],
		queryFn: () => basicDataQuery('api/gsm/', params.interval, ['time', 'axy', 'az', 'a10']),
		optionsFn: size => gsmPlotOptions(size, params)
	}}/>);
}