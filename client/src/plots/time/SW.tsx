import { type BasicPlotParams, basicDataQuery } from '../basicPlot';
import BasicPlot from '../BasicPlot';
import { color, superScript } from '../plotUtil';

export type SWParams = BasicPlotParams & {
	useTemperatureIndex: boolean,
	showBeta: boolean,
	showDensity: boolean,
};

export default function PlotSW({ params }: { params: SWParams }) {
	const { useTemperatureIndex, showBeta, showDensity, interval } = params;
	const tColumn = useTemperatureIndex ? 'temperature_idx' : 'sw_temperature';
	return (<BasicPlot {...{
		queryKey: ['SW', useTemperatureIndex],
		queryFn: async () => {
			const data = await basicDataQuery('omni', interval, ['time', 'sw_density', 'plasma_beta', tColumn]);
			return data?.concat([Array(data[0].length).fill(.5)]) ?? null;
		},
		params,
		options: () => (useTemperatureIndex ? {
			bands: [{
				series: [3,4],
				fill: color('cyan', .7),
				dir: 1
			}]
		} : {}),
		axes: () => [
			{
				show: showBeta || showDensity,
				label: 'Dp',
				fullLabel: showDensity ? ('Dp, N/cm³' + (showBeta ? ' & beta' : '')) : 'beta',
				position: [1/8, 1],
				whole: true,
				side: 1,
			},
			{
				label: 'Tp',
				...(useTemperatureIndex && { minMax: [0, null] }),
				fullLabel: useTemperatureIndex ? 'Tp index' : 'Tp, K',
				showGrid: showBeta || showDensity ? false : true,
				distr: useTemperatureIndex ? 1 : 3,
				...(!useTemperatureIndex && { values: (u, vals) => vals.map(v => Math.log10(v) % 1 === 0 ? '10' + superScript(Math.log10(v)) : '') })
			},
		],
		series: () => [
			{
				show: !!showDensity,
				label: 'Dp',
				legend: 'Proton density',
				scale: 'Dp',
				marker: 'circle',
				stroke: color('peach'),
				width: 2,
			},
			{
				show: !!showBeta,
				label: 'beta',
				legend: 'Plasma beta',
				scale: 'Dp',
				marker: 'square',
				stroke: color('magenta'),
				width: 1,
			},
			{
				label: 'Tp',
				legend: useTemperatureIndex ? 'Temperature index' : 'Proton temperature',
				scale: 'Tp',
				marker: 'diamond',
				stroke: color('cyan'),
				width: 2,
			},
			{
				scale:  useTemperatureIndex ? 'Tp' : 'y'
			}
		]
	}}/>);
}