import uPlot from 'uplot';
import { markersPaths } from './plotPaths';
import { axisDefaults, basicDataQuery, BasicPlot, BasicPlotParams, color, customTimeSplits } from './plotUtil';

export type GeomgnParams = BasicPlotParams & {
	useAp: boolean,
};

function plotOptions(params: GeomgnParams): Partial<uPlot.Options> {
	const myBars = (upl: uPlot, seriesIdx: number, i0: number, i1: number) => {
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
	return {
		axes: [
			{
				...axisDefaults(params.showGrid),
				...customTimeSplits(params),
			},
			{
				...axisDefaults(params.showGrid),
				label: '',
				scale: 'idx',
				grid: { show: false },
				splits: (u, aidx, min, max) => [Math.max(10, min), Math.round(max / 2 / 10) * 10],
				values: (u, vals) => vals.map(v => (params.useAp ? v : v / 10).toFixed(0))
			},
			{
				side: 1,
				...axisDefaults(params.showGrid),
				ticks: { show: false },
				gap: 6,
				label: '',
				scale: 'dst',
				filter: (u, spl) => spl.map(s => s >= -25 || s > u.scales.dst.min! * 2 / 3 ? s : null)
			},
		],
		scales: {
			idx: {
				range: (u, min, max) => [0, max*2.5]
			},
			dst: {
				range: (u, min, max) => [min-(Math.max(10, max + 1)-min), Math.max(10, max + 1)]
			}
		},
		series: [
			{
				label: 'time',
				value: '{YYYY}-{MM}-{DD} {HH}:{mm}'
			},
			{
				show: !params.useAp,
				label: 'Kp',
				scale: 'idx',
				width: 0,
				stroke: color('green'),
				points: { show: false },
				paths: myBars,
			},
			{
				show: params.useAp,
				label: 'Ap',
				scale: 'idx',
				width: 0,
				stroke: color('yellow'),
				points: { show: false },
				paths: myBars,
			},
			{
				label: 'Dst',
				scale: 'dst',
				stroke: color('skyblue'),
				width: 2,
				points: {
					show: params.showMarkers,
					stroke: color('skyblue'),
					fill: color('skyblue', .9),
					paths: markersPaths('circle', 5)
				}
			},
		]
	};
}

export default function PlotGeoMagn(params: GeomgnParams) {
	return (<BasicPlot {...{
		queryKey: ['geomagn', params.interval],
		queryFn: () => basicDataQuery('api/omni/', params.interval, ['time', 'kp_index', 'ap_index', 'dst_index']),
		options: plotOptions(params),
		params,
		labels: { dst: 'Dst, nT', idx: (params.useAp ? 'Ap' : 'Kp') + ' idx' }
	}}/>);
}