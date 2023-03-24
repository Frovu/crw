import uPlot from 'uplot';
import { axisDefaults, basicDataQuery, BasicPlot, BasicPlotParams, color, customTimeSplits, drawCustomLabels } from './plotUtil';

type MagnParams = BasicPlotParams & {
	useAp?: boolean,
};

function plotOptions(params: MagnParams ) {
	return (size: { width: number, height: number }, grid: boolean ): uPlot.Options => {
		const myBars = (upl: uPlot, seriesIdx: number, i0: number, i1: number) => {
			const colors = [color('green'), color('gold'), color('orange'), color('red')];
			const lastColor = color('crimson');
			const range = params.useAp ? [18, 39, 67, 179] : [36, 46, 56, 76];
			const values = (u: uPlot, sidx: number) => (u.data[sidx] as number[]).map(v => {
				for (const [i, mx] of range.entries())
					if (v < mx) return colors[i];
				return lastColor;
			});
			return uPlot.paths.bars!({
				size: [1 + (upl.data[0].length) / 1600, Infinity],
				disp: {
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
			...size,
			padding: [4, 0, 4, 0],
			legend: { show: params.interactive },
			cursor: {
				show: params.interactive,
				drag: { x: false, y: false, setScale: false }
			},
			hooks: {
				draw: [
					drawCustomLabels({ dst: 'Dst idx', idx: (params.useAp ? 'Ap' : 'Kp') + ' idx' })
				],
			},
			axes: [
				{
					...axisDefaults(grid),
					...customTimeSplits(params),
				},
				{
					...axisDefaults(grid),
					label: '',
					scale: 'idx',
					grid: { show: false },
					splits: (u, aidx, min, max) => [Math.max(10, min), Math.round(max / 2 / 10) * 10],
					values: (u, vals) => vals.map(v => (params.useAp ? v : v / 10).toFixed(0))
				},
				{
					side: 1,
					...axisDefaults(grid),
					gap: -1,
					label: '',
					scale: 'dst',
					splits: (u, aidx, min, max) => [Math.round(min / 2), 0],
				},
			],
			scales: {
				idx: {
					range: (u, min, max) => [min, max*2]
				},
				dst: {
					range: (u, min, max) => [min - (max-min), max]
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
					stroke: color('gold'),
					points: { show: false },
					paths: myBars,
				},
				{
					show: params.useAp,
					label: 'Ap',
					scale: 'idx',
					stroke: color('gold'),
					points: { show: false },
					paths: myBars,
				},
				{
					label: 'Dst',
					scale: 'dst',
					stroke: color('skyblue'),
					width: 2,
					points: { show: false },
				},
			]
		};
	};
}

export default function PlotGeoMagn(params: MagnParams) {
	return (<BasicPlot {...{
		queryKey: ['Magn', params.interval],
		queryFn: () => basicDataQuery('api/omni/', params.interval, ['time', 'kp_index', 'ap_index', 'dst_index']),
		optionsFn: plotOptions(params)
	}}/>);
}