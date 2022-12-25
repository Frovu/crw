import uPlot from 'uplot';
import { axisDefaults, basicDataQuery, BasicPlot, BasicPlotParams, color, customTimeSplits, drawMagneticClouds, drawOnsets } from './plotUtil';

type GSMParams = BasicPlotParams & {
	showAz?: boolean
};

function gsmPlotOptions(size: { width: number, height: number }, params: GSMParams): uPlot.Options {
	const az = params.showAz;
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
				side: 1,
				scale: 'axy',
				gap: 2,
				size: 40,
				space: 20,
				ticks: { ...axisDefaults().ticks, filter: (u, splits) => splits.filter(sp => sp < u.scales.axy.max! / 2 + u.scales.axy.min!) },
				filter: (u, splits) => splits.filter(sp => sp < u.scales.axy.max! / 2 + u.scales.axy.min!),
				values: (u, vals) => vals.map(v => v.toFixed(v > 0 && vals[1] - vals[0] < 1 ? 1 : 0)).concat('Axy' + (az ? '\n Az' : '')),
			},
			{
				...axisDefaults(),
				scale: 'var',
				gap: 0,
				size: 46,
				space: 36,
				values: (u, vals) => vals.map(v => v.toFixed(vals[0] <= -10 ? 0 : 1)),
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
				label: 'axy',
				stroke: color('magenta', .8),
				fill: color('magenta', .3),
				paths: uPlot.paths.bars!({ size: [.4, 16] }),
				points: { show: false }
			},
			{
				show: az,
				scale: 'axy',
				label: 'az',
				stroke: color('purple', .8),
				fill: color('purple', .6),
				paths: uPlot.paths.bars!({ size: [.2, 10] }),
				points: { show: false }
			},
			{
				scale: 'var',
				label: 'a10',
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