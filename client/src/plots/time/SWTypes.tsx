import { useQuery } from '@tanstack/react-query';
import { basicDataQuery, tooltipPlugin, metainfoPlugin, paddedInterval, sliceData } from '../basicPlot';
import { axisDefaults, color, customTimeSplits, font, scaled } from '../plotUtil';
import { ExportableUplot } from '../../events/ExportPlot';
import type uPlot from 'uplot';
import { useCallback } from 'react';
import { usePlotParams, type EventsPanel } from '../../events/core/eventsSettings';

export const SW_TYPES = ['IS', 'ISa', 'SH', 'MC', 'EJE', 'CIR', 'HCS', 'RARE'] as const;

const COLORS = ['magenta', 'magenta', 'acid', 'cyan', 'purple', 'green', 'peach', 'purple'];

async function getTypes(interval: [Date, Date]) {
	const data = await basicDataQuery('omni', interval, ['time', 'sw_type']);
	if (!data) return null;
	const swt = (data[1] as any as (string | null)[]).map((t) => t?.split(','));
	const plotData = [data[0]];
	for (const [i, type] of SW_TYPES.entries()) {
		const val = SW_TYPES.length - i - 1;
		plotData.push(...['', '?'].map((mod) => swt.map((t) => (!t?.includes(type + mod) ? null : val))));
	}
	return plotData;
}

function Panel() {
	const params = usePlotParams<{}>();
	const query = useQuery({
		queryKey: ['SWTypes', paddedInterval(params.interval)],
		queryFn: async () => await getTypes(params.interval),
	});

	const options = useCallback(() => {
		const { showGrid, showTimeAxis } = params;
		const axDef = axisDefaults(showGrid);
		return {
			padding: [scaled(4), 0, showTimeAxis ? 0 : scaled(2), 0],
			legend: { show: false },
			focus: { alpha: 0.5 },
			cursor: { drag: { setScale: false }, focus: { prox: 32 } },
			plugins: [metainfoPlugin({ params }), tooltipPlugin()],
			scales: { y: { range: [-0.2, SW_TYPES.length - 0.8] } },
			axes: [
				{
					...axDef,
					...customTimeSplits(params),
				},
				...[3, 1].map((side) => ({
					...axDef,
					font: font(13),
					side,
					size: (axDef.size as any) + axDef.labelSize,
					splits: Array.from(Array(SW_TYPES.length).keys()),
					values: SW_TYPES.slice().reverse(),
				})),
			],
			series: [{}].concat(
				SW_TYPES.flatMap((type, i) =>
					['high', 'medium'].map(
						(reli) =>
							({
								stroke: color(COLORS[i]),
								width: scaled(5),
								label: type,
								points: {
									show: true,
									width: scaled(0.5),
									size: scaled(8),
									stroke: color(COLORS[i]),
									fill: color(reli === 'high' ? COLORS[i] : 'bg'),
								},
							} as uPlot.Series)
					)
				)
			),
		} as Omit<uPlot.Options, 'width' | 'height'>;
	}, [params]);

	if (query.isLoading) return <div className="Center">LOADING...</div>;
	if (query.isError)
		return (
			<div className="Center" style={{ color: color('red') }}>
				FAILED TO LOAD
			</div>
		);
	if (!query.data?.[0].length) return <div className="Center">NO DATA</div>;

	return (
		<div style={{ position: 'absolute' }}>
			<ExportableUplot {...{ options, data: sliceData(query.data, params.interval) }} />
		</div>
	);
}

export const SWTypesPlot: EventsPanel<{}> = {
	name: 'SW Types',
	Panel,
	isPlot: true,
};
