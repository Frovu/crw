import uPlot from 'uplot';
import { axisDefaults, BasicPlot, BasicPlotParams, color, customTimeSplits, drawMagneticClouds, drawOnsets } from './plotUtil';

type SWParams = BasicPlotParams & {
};

function gsmPlotOptions(size: { width: number, height: number }, params: SWParams): uPlot.Options {
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

async function querySW(params: SWParams) {
	const urlPara = new URLSearchParams({
		from: (params.interval[0].getTime() / 1000).toFixed(0),
		to:   (params.interval[1].getTime() / 1000).toFixed(0),
	}).toString();
	const res = await fetch(process.env.REACT_APP_API + 'api/gsm/?' + urlPara);
	if (res.status !== 200)
		throw Error('HTTP '+res.status);
	const body = await res.json() as { data: any[][], fields: string[] };
	if (!body?.data.length) return null;
	const fieldsIdx = ['time', 'axy', 'az', 'a10'].map(f => body.fields.indexOf(f));
	return fieldsIdx.map(i => body.data.map(row => row[i]));
}	

export default function PlotSW(params: SWParams) {
	return (<BasicPlot {...{
		queryKey: ['IMF', params.interval],
		queryFn: () => querySW(params),
		optionsFn: size => gsmPlotOptions(size, params)
	}}/>);
}