import uPlot from 'uplot';
import { basicDataQuery, BasicPlot, BasicPlotParams, color } from '../plotUtil';

export type GeomagnParams = BasicPlotParams & {
	useAp: boolean,
};

const myBars = (params: GeomagnParams) => (upl: uPlot, seriesIdx: number, i0: number, i1: number) => {
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

export default function PlotGeoMagn(params: GeomagnParams) {
	return (<BasicPlot {...{
		queryKey: ['geomagn', params.interval],
		queryFn: () => basicDataQuery('api/omni/', params.interval, ['time', 'kp_index', 'ap_index', 'dst_index']),
		params,
		axes: [
			{
				label: 'idx',
				fullLabel: (params.useAp ? 'Ap' : 'Kp') + ' index',
				position: [0, 1/2 - 1/50],
				minMax: [0, 50],
				showGrid: false,
				values: (u, vals) => vals.map(v => v == null ? v : (params.useAp ? v : v / 10).toFixed(0))
			},
			{
				label: 'Dst',
				fullLabel: 'Dst, nT',
				position: [1/2, 1],
				minMax: [null, 0],
				side: 1,
				ticks: { show: false },
				gap: 6,
			},
		],
		series: [
			{
				show: !params.useAp,
				label: 'Kp',
				scale: 'idx',
				width: 0,
				stroke: color('green'),
				paths: myBars(params),
			},
			{
				show: params.useAp,
				label: 'Ap',
				scale: 'idx',
				width: 0,
				stroke: color('yellow'),
				paths: myBars(params),
			},
			{
				label: 'Dst',
				stroke: color('skyblue'),
				width: 2,
				marker: 'circle'
			},
		]
	}}/>);
}