import uPlot from 'uplot';
import { type BasicPlotParams, basicDataQuery } from '../basicPlot';
import BasicPlot from '../BasicPlot';
import { color } from '../plotUtil';

export type GeomagnParams = BasicPlotParams & {
	useAp: boolean,
};

const myBars = (params: GeomagnParams) => (scl: number) => (upl: uPlot, seriesIdx: number, i0: number, i1: number) => {
	const colors = [color('green'), color('yellow'), color('orange'), color('red')];
	const lastColor = color('crimson');
	const range = params.useAp ? [18, 39, 67, 179] : [36, 46, 56, 76];
	const values = (u: uPlot, sidx: number) => (u.data[sidx] as number[]).map(v => {
		for (const [i, mx] of range.entries())
			if (v < mx) return colors[i];
		return lastColor;
	});
	return uPlot.paths.bars!({
		size: [1 + (upl.data[0].length) / 1600, Infinity],
		align: 1,
		disp: {
			y0: {
				unit: 1,
				values: (u) => u.data[seriesIdx].map(v => 0) as any
			},
			y1: {
				unit: 1,
				values: (u) => u.data[seriesIdx].map(v => !v ? 1 : v) as any
			},
			stroke: {
				unit: 3,
				values,
			},
			fill: {
				unit: 3,
				values
			}
		}
	})(upl, seriesIdx, i0, i1);
};

export default function PlotGeoMagn({ params }: { params: GeomagnParams }) {
	return (<BasicPlot {...{
		queryKey: ['geomagn'],
		queryFn: () => basicDataQuery('omni', params.interval, ['time', 'kp_index', 'ap_index', 'dst_index']),
		params,
		axes: () => [
			{
				label: 'Kp',
				fullLabel: (params.useAp ? 'Ap' : 'Kp') + ' index',
				position: [0, 2/5 - 1/20],
				minMax: [0, 50],
				showGrid: false,
				values: (u, vals) => vals.map(v => v == null ? v : (params.useAp ? v : v / 10).toFixed(0)),
				splits: (u, aidx, min, max) => [0, max > 50 ? 90 : 50]
			},
			{
				label: 'Dst',
				fullLabel: 'Dst, nT',
				position: [2/5, 1],
				minMax: [null, 0],
				side: 1,
				ticks: { show: false },
				gap: 0,
			},
		],
		series: () => [
			{
				show: !params.useAp,
				label: 'Kp',
				scale: 'Kp',
				legend: 'Kp index',
				width: 0,
				bars: true,
				stroke: color('green'),
				myPaths: myBars(params),
			},
			{
				show: params.useAp,
				label: 'Ap',
				scale: 'Kp',
				width: 0,
				bars: true,
				stroke: color('yellow'),
				myPaths: myBars(params),
			},
			{
				label: 'Dst',
				legend: 'Dst, nT',
				stroke: color('skyblue'),
				width: 2,
				marker: 'circle'
			},
		]
	}}/>);
}