import { colorKeys, color } from '../../app';
import { Button, CloseButton } from '../../components/Button';
import { Checkbox } from '../../components/Checkbox';
import { TextInput } from '../../components/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/Select';
import { useFeidCursor } from '../../events/core/eventsState';
import { usePlot } from '../../events/core/plot';
import type { EventsPanel } from '../../events/core/util';
import type { ContextMenuProps } from '../../layout';
import { apiPost } from '../../util';
import BasicPlot from '../BasicPlot';

const plotColors = colorKeys.slice(0, colorKeys.indexOf('crimson') + 1).filter((col) => !col.endsWith('2'));
const defaultColors: (typeof colorKeys)[number][] = ['cyan', 'green', 'peach', 'magenta'];

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

function Menu({ params, setParams }: ContextMenuProps<CustomPlotParams>) {
	const { series } = params;
	const setSer = <K extends keyof Series>(i: number, key: K, val: Series[K]) =>
		setParams({ series: series.toSpliced(i, 1, { ...series[i], [key]: val }) });

	return (
		<>
			{params.series.map(({ definition, label, color: clr, rightAxis }, i) => (
				<div key={i + definition + clr} className="flex gap-[1px] items-center">
					<Select value={clr} onValueChange={(val) => setSer(i, 'color', val as any)}>
						<SelectTrigger className="w-5 h-5 mr-1 rounded-xl" style={{ background: color(clr) }} />
						<SelectContent side="top">
							{plotColors.map((col) => (
								<SelectItem key={col} value={col}>
									<div className="flex items-center gap-1">
										<div className="w-4 h-4" style={{ background: color(col) }} />
										{col}
									</div>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<TextInput className="w-12" value={label ?? ''} onSubmit={(val) => setSer(i, 'label', val || null)} />=
					<TextInput
						className="w-80 text-left pl-1"
						value={definition}
						onSubmit={(val) => setSer(i, 'definition', val)}
					/>
					<Checkbox
						title="Display on the right axis"
						label="r"
						checked={!!rightAxis}
						onCheckedChange={(val) => setSer(i, 'rightAxis', val)}
					/>
					<CloseButton className="pl-1" onClick={() => setParams({ series: series.toSpliced(i, 1) })} />
				</div>
			))}
			<Button
				onClick={() =>
					setParams({
						series: [
							...series,
							{
								definition: '',
								label: null,
								color: defaultColors.find((col) => !series.find((ser) => ser.color === col)) ?? 'white',
							},
						],
					})
				}
			>
				+ add series
			</Button>
		</>
	);
}

function Panel() {
	const { id: feidId } = useFeidCursor();
	const params = usePlot<CustomPlotParams>();
	const { series } = params;
	const definitions = series.map((ser) => ser.definition).filter((def) => !!def);

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
						whole: true,
					},
					{
						label: 'c right',
						fullLabel: rightLabel,
						whole: true,
						side: 1,
						showGrid: false,
					},
				],
				series: () =>
					series
						.filter((ser) => ser.definition)
						.map(({ label, definition, color: clr, rightAxis }) => ({
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
