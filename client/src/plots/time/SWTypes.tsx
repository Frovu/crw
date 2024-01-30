import { useQuery } from 'react-query';
import { type BasicPlotParams, basicDataQuery } from '../basicPlot';
import { axisDefaults, color, customTimeSplits, drawMagneticClouds, drawOnsets, font, scaled } from '../plotUtil';
import { ExportableUplot } from '../../events/ExportPlot';
import type uPlot from 'uplot';
import { useCallback } from 'react';

const SW_TYPES = ['IS', 'ISa', 'SH', 'MC', 'EJE', 'CIR', 'HCS', 'RARE'];

const COLORS = ['magenta', 'magenta', 'acid', 'cyan', 'purple', 'green', 'peach', 'purple'];

export type SWTypesParams = BasicPlotParams & {
	
};

function plotOptions(params: SWTypesParams): Omit<uPlot.Options, 'width'|'height'> {
	const { showGrid, showTimeAxis } = params;
	const axDef = axisDefaults(showGrid);
	return {
		padding: [scaled(6), 0, showTimeAxis ? 0 : scaled(8), 0],
		legend: { show: false },
		cursor: { show: false },
		hooks: {
			drawAxes: [ drawMagneticClouds(params) ],
			draw: [ drawOnsets(params) ]
		},
		scales: { y: { range: [ 0, SW_TYPES.length - .8 ] } },
		axes: [{
			...axDef,
			...customTimeSplits(params)
		}, ...[3, 1].map(side => ({
			...axDef,
			font: font(13),
			side,
			size: axDef.size as any + axDef.labelSize,
			splits: Array.from(Array(SW_TYPES.length).keys()),
			values: SW_TYPES.toReversed()
		}))],
		series: [{ }].concat(SW_TYPES.flatMap((type, i) => ['high', 'medium'].map(reli => ({
			stroke: color(COLORS[i]),
			width: scaled(5),
			points: {
				show: true,
				width: scaled(.5),
				size: scaled(8),
				stroke: color(COLORS[i]),
				fill: color(reli === 'high' ? COLORS[i] : 'bg')
			},

		} as uPlot.Series))))
	};
}

async function getTypes(interval: SWTypesParams['interval']) {
	const data = await basicDataQuery('omni', interval, ['time', 'sw_type']);
	if (!data) return null;
	const swt = (data[1] as any as (string | null)[]).map(t => t?.split(','));
	const plotData = [data[0]];
	for (const [i, type] of SW_TYPES.entries()) {
		const val = SW_TYPES.length - i - 1;
		plotData.push(...['', '?'].map(mod =>
			swt.map(t => !t?.includes(type + mod) ? null : val)));
	}
	return plotData;
}

export default function PlotSWTypes({ params }: { params: SWTypesParams }) {
	const query = useQuery({
		queryKey: ['SWTypes', params.interval],
		queryFn: async () => await getTypes(params.interval)
	});

	const options = useCallback(() => plotOptions(params), [params]);

	if (query.isLoading)
		return <div className='Center'>LOADING...</div>;
	if (query.isError)
		return <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>;
	if (!query.data?.[0].length)
		return <div className='Center'>NO DATA</div>;

	return (<div style={{ position: 'absolute' }}>
		<ExportableUplot {...{ options, data: query.data }}/>
	</div>);
}