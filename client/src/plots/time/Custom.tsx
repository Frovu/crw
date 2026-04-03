import { colorKeys, color } from '../../app';
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
			definition: '$a10m',
			label: 'A0m',
			color: 'cyan',
		},
	],
};

async function customPlotDataQuery([from, to]: [number, number], definitions: string[]) {
	const body = await apiPost<{ rows: (number | null)[][] }>('plot', {
		from: from.toFixed(0),
		to: to.toFixed(0),
		definitions,
	});
	const timeShifted = body.rows.map((row) => (row[0] == null ? null : row[0] + 3600 / 2));
	const transposed = definitions.map((d, i) => body.rows.map((row) => row[i + 1]));
	console.log('custom =>', transposed, definitions);
	return [timeShifted, ...transposed];
}

function Menu({ Checkbox }: ContextMenuProps<CustomPlotParams>) {
	return <></>;
}

function Panel() {
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
				queryFn: (interval) => customPlotDataQuery(interval, definitions),
				params,
				axes: () => [
					{
						label: 'c left',
						fullLabel: leftLabel,
					},
					{
						label: 'c right',
						fullLabel: rightLabel,
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
