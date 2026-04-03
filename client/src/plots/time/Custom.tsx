import { colorKeys, color } from '../../app';
import { useFeidCursor } from '../../events/core/eventsState';
import { usePlot } from '../../events/core/plot';
import type { EventsPanel } from '../../events/core/util';
import type { ContextMenuProps } from '../../layout';
import { apiPost } from '../../util';
import BasicPlot from '../BasicPlot';

type Series = {
	definition: string;
	label: string | null;
	color: (typeof colorKeys)[number];
	rightAxis?: boolean;
};

export type CustomPlotParams = {
	series: Series[];
};

const defaultParams: CustomPlotParams = {
	series: [
		{
			definition: '($a10m - val($a10m)) * rebase($a10m)',
			label: 'A0m',
			color: 'cyan',
		},
	],
};

async function customPlotDataQuery(interval: [number, number], definitions: string[], feidId: number | null) {
	if (feidId == null) return null;
	const body = await apiPost<{ data: (number | null)[][] }>('events/plot', {
		interval,
		definitions,
		feidId,
	});
	const timeShifted = body.data[0].map((tm) => tm! + 3600 / 2);
	console.log('custom =>', body.data, definitions);
	return [timeShifted, ...body.data.slice(1)];
}

function Menu({ Checkbox }: ContextMenuProps<CustomPlotParams>) {
	return <></>;
}

function Panel() {
	const { id: feidId } = useFeidCursor();
	const params = usePlot<CustomPlotParams>();
	const { series } = params;
	const definitions = series.map((ser) => ser.definition);

	const leftLabel = series
		.filter((s) => !s.rightAxis)
		.map((s) => s.label ?? s.definition)
		.join(', ');
	const rightLabel = series
		.filter((s) => s.rightAxis)
		.map((s) => s.label ?? s.definition)
		.join(', ');

	return (
		<BasicPlot
			{...{
				queryKey: (interval) => ['CustomPlot', JSON.stringify(definitions), interval],
				queryFn: (interval) => customPlotDataQuery(interval, definitions, feidId),
				params,
				axes: () => [
					{
						label: 'c left',
						fullLabel: leftLabel,
					},
					{
						label: 'c right',
						fullLabel: rightLabel,
						side: 1,
						showGrid: false,
					},
				],
				series: () =>
					series.map(({ label, definition, color: clr, rightAxis }) => ({
						label: label ?? definition,
						legend: label ?? definition,
						scale: rightAxis ? 'c right' : 'c left',
						stroke: color(clr),
						width: 2,
						marker: 'circle',
					})),
			}}
		/>
	);
}

export const CustomPlot: EventsPanel<CustomPlotParams> = {
	name: 'Custom plot',
	Menu,
	Panel,
	defaultParams,
	isPlot: true,
};
