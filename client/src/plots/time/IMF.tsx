import { basicDataQuery, BasicPlot, BasicPlotParams, color, CustomSeries } from '../plotUtil';

export type IMFParams = BasicPlotParams & {
	showBz: boolean,
	showBxBy: boolean,
};

export default function PlotIMF(params: IMFParams) {
	return (<BasicPlot {...{
		queryKey: ['IMF', params.interval],
		queryFn: () => basicDataQuery('api/omni/', params.interval, ['time', 'sw_speed', 'imf_scalar', 'imf_x', 'imf_y', 'imf_z']),
		params,
		axes: [
			{
				label: 'Vsw',
				position: [1/2, 1],
				fullLabel: 'Vsw, km/s',
				showGrid: false,
				side: 1,
			}, {
				label: 'IMF',
				position: [0, 3/5],
				fullLabel: `IMF(|B|${params.showBxBy?',Bx,By':''}${params.showBz?',Bz':''}), nT`,
				whole: true,
			}
		],
		series: [
			{
				label: 'Vsw',
				legend: 'Vsw, km/s',
				scale: 'Vsw',
				stroke: color('acid'),
				width: 2,
				marker: 'diamond',
			}, {
				label: '|B|',
				legend: 'IMF |B|, nT',
				scale: 'IMF',
				stroke: color('purple'),
				width: 2,
				marker: 'circle',
			},
			...[['Bx', 'cyan', 'triangleDown'], ['By', 'green', 'triangleUp'], ['Bz', 'magenta', 'square']].map(([label, stroke, marker]) => ({
				show: label === 'Bz' ? params.showBz : params.showBxBy,
				label,
				legend: `IMF  ${label}, nT`,
				scale: 'IMF',
				stroke: color(stroke),
				marker,
			} as CustomSeries))
		]
	}}/>);
}