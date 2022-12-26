import uPlot from 'uplot';
import { axisDefaults, basicDataQuery, BasicPlot, BasicPlotParams, color, customTimeSplits, drawCustomLabels } from './plotUtil';

type MagnParams = BasicPlotParams & {
	useAp?: boolean,
};

function plotOptions(size: { width: number, height: number }, params: MagnParams): uPlot.Options {
	return {
		...size,
		padding: [2, 4, 12, 0],
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
				...axisDefaults(),
				...customTimeSplits(params),
			},
			{
				...axisDefaults(),
				label: '',
				scale: 'idx',
				grid: { show: false },
				values: (u, vals) => vals.map(v => (params.useAp ? v : v / 10).toFixed(0))
			},
			{
				side: 1,
				...axisDefaults(),
				label: '',
				scale: 'dst',
			},
		],
		scales: {
			idx: {
			},
			dst: {
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
				stroke: color('cyan'),
				points: { show: false },
				paths: uPlot.paths.bars!({ size: [.2, 10] }),
			},
			{
				show: params.useAp,
				label: 'Ap',
				scale: 'idx',
				stroke: color('magenta'),
				points: { show: false },
				paths: uPlot.paths.bars!({ size: [.2, 10] }),
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
}

export default function PlotGeoMagn(params: MagnParams) {
	return (<BasicPlot {...{
		queryKey: ['Magn', params.interval],
		queryFn: () => basicDataQuery('api/omni', params.interval, ['time', 'kp_index', 'ap_index', 'dst_index']),
		optionsFn: size => plotOptions(size, params)
	}}/>);
}