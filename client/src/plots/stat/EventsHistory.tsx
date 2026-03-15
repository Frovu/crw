import { useMemo } from 'react';
import type uPlot from 'uplot';
import type { ContextMenuProps } from '../../layout';
import { useColumnOptions, useSampleOptions, type SampleOption } from './statPlotUtils';
import { useTable } from '../../events/core/editableTables';
import { NumberInput } from '../../components/Input';
import { SimpleSelect } from '../../components/Select';
import { usePlot } from '../../events/core/plot';
import { useEventsSettings } from '../../events/core/util';
import { ExportableUplot } from '../../events/export/ExportableUplot';
import { applySample } from '../../events/sample/sample';
import { cn } from '../../util';
import { tooltipPlugin, legendPlugin, labelsPlugin } from '../basicPlot';
import { usePlotOverlay, scaled, measureDigit, axisDefaults, markersPaths } from '../plotUtil';
import { color } from '../../app';
import { Button } from '../../components/Button';
import { useFeidSample } from '../../events/core/feid';

const windowOptions = {
	'2 years': 24,
	'1 year': 12,
	'6 months': 6,
	'4 months': 4,
	'3 months': 3,
	'2 months': 2,
	'1 month': 1,
} as const;

const seriesColors = ['green', 'purple', 'magenta', 'acid', 'cyan'] as const;
const seriesMarkers = ['diamond', 'circle', 'square', 'triangleUp', 'triangleDown'] as const;

type StatSeries = {
	sample: SampleOption;
	column: null | '<count>' | string;
};

const defaultParams = {
	window: '1 year' as keyof typeof windowOptions,
	historySeries: [0, 1, 2, 3, 4].map((i) => ({ sample: '<current>', column: i === 0 ? '<count>' : null })) as StatSeries[],
	forceLeft: null as null | number,
	forceRight: null as null | number,
	showXLabel: false,
	historyOneAxis: false,
};

export type HistoryParams = typeof defaultParams;
function Menu({ params, set, setParams, Checkbox }: ContextMenuProps<HistoryParams>) {
	const { historySeries: series } = params;
	const sampleOpts = useSampleOptions();
	const columnOpts = useColumnOptions(
		['integer', 'real'],
		series.map((s) => s.column),
	);

	const setSample = (i: number, val: StatSeries['sample']) =>
		set('historySeries', series.toSpliced(i, 1, { ...series[i], sample: val }));
	const setColumn = (i: number, val: StatSeries['column']) =>
		set('historySeries', series.toSpliced(i, 1, { ...series[i], column: val }));

	return (
		<>
			{([0, 1, 2, 3, 4] as const).map((i) => (
				<div key={i} className="flex gap-0.5">
					<Button
						className="pr-1"
						title="Reset"
						style={{ color: color(seriesColors[i]) }}
						onClick={() => set('historySeries', series.toSpliced(i, 1, { column: null, sample: '<current>' }))}
					>
						#{i}
					</Button>
					<SimpleSelect
						title="Column"
						className={cn('w-30 bg-input-bg/80', !series[i]?.column && 'text-dark')}
						options={[
							[null, '<none>'],
							['<count>', '<count>'],
							...columnOpts.map(({ sql_name, name }) => [sql_name, name] as [string, string]),
						]}
						value={series[i].column}
						onChange={(val) => setColumn(i, val)}
					/>
					:
					<SimpleSelect
						title="Sample (none = all events)"
						className={cn('w-30 bg-input-bg/80 justify-center', series[i].sample === '<current>' && 'text-dark')}
						options={sampleOpts}
						value={series[i].sample}
						onChange={(val) => setSample(i, val)}
					/>
				</div>
			))}
			<div className="flex items-center">
				<Checkbox className="pr-4" label="X label" k="showXLabel" />
				Window:
				<SimpleSelect
					className="w-22"
					value={params.window}
					options={Object.keys(windowOptions).map((w) => [w, w])}
					onChange={(val) => set('window', val as any)}
				/>
			</div>
			<div style={{ textAlign: 'right' }}>
				<Button title="Reset" onClick={() => setParams({ forceLeft: null, forceRight: null })}>
					Limit years:
				</Button>
				<NumberInput
					className="w-16 ml-1"
					min={1950}
					max={new Date().getUTCFullYear()}
					value={params.forceLeft}
					onChange={(val) => set('forceLeft', val)}
					allowNull={true}
				/>
				;
				<NumberInput
					className="w-16"
					min={1950}
					max={new Date().getUTCFullYear()}
					value={params.forceRight}
					onChange={(val) => set('forceRight', val)}
					allowNull={true}
				/>
			</div>
			<Checkbox label="Merge vertical axes" k="historyOneAxis" />
		</>
	);
}

function Panel() {
	const { data: currentData, samples: samplesList } = useFeidSample();
	const { showGrid, showMarkers, showLegend } = useEventsSettings();
	const { columns, data: allData } = useTable('feid');
	const params = usePlot<HistoryParams>();

	const overlayHandle = usePlotOverlay((u, { width }) => ({
		x: (u.bbox.left + u.bbox.width - scaled(width)) / scaled(1) + 6,
		y: 3,
	}));

	const data = useMemo(() => {
		console.time('Events History data');
		const window = windowOptions[params.window];
		const timeColIdx = columns.findIndex((c) => c.name === 'time');
		if (timeColIdx < 0) return [[], []];
		const firstEvent = allData[0][timeColIdx] as Date;
		const lastEvent = params.forceRight
			? new Date(Date.UTC(params.forceRight, 0, 1))
			: (allData.at(-1)![timeColIdx] as Date);
		const firstMonth = params.forceLeft
			? (params.forceLeft - 1970) * 12
			: Math.floor(((firstEvent.getUTCFullYear() - 1970) * 12 + firstEvent.getUTCMonth()) / window) * window;

		const time = [];
		const values = params.historySeries.map((s) => [] as number[]);
		const samples = params.historySeries.map(({ sample }) =>
			sample === '<none>'
				? allData
				: sample === '<current>'
					? currentData
					: samplesList
						? applySample(allData, samplesList.find((s) => s.id === sample) ?? null, columns, samplesList)
						: [],
		);

		for (let bin = 0; bin < 9999; ++bin) {
			const start = Date.UTC(1970, firstMonth + bin * window, 1);
			const end = Date.UTC(1970, firstMonth + bin * window + window, 1);

			if (start >= lastEvent.getTime()) break;
			time.push((start + end) / 2 / 1e3);

			for (const [i, { column }] of params.historySeries.entries()) {
				if (column == null) continue;
				const batch = samples[i].filter(
					(row) => start <= (row[timeColIdx] as Date).getTime() && (row[timeColIdx] as Date).getTime() < end,
				);

				const colIdx = columns.findIndex((col) => col.sql_name === column);
				const val =
					column === '<count>'
						? batch.length
						: batch.reduce((acc, row) => acc + (row[colIdx] as number), 0) / batch.length;

				values[i].push(val);
			}
		}
		console.timeEnd('Events History data');

		return [time, ...values];
	}, [allData, columns, currentData, params.forceLeft, params.forceRight, params.historySeries, params.window, samplesList]);

	const options = useMemo(() => {
		return () => {
			const ch = measureDigit().width,
				scale = scaled(1);
			const columnNames = params.historySeries.map(({ column }) =>
				column === '<count>' ? 'count' : columns.find((cc) => cc.sql_name === column)?.name,
			);
			const scaleNames = params.historyOneAxis
				? [columnNames[0]]
				: Array.from(new Set(columnNames.filter((c) => c)).values());
			const sampleNames = params.historySeries.map(({ sample: id }) =>
				'<current>' === id
					? ''
					: '<none>' === id
						? ' (all)'
						: ' of ' + (samplesList?.find((s) => s.id === id)?.name ?? 'UNKNOWN'),
			);
			return {
				padding: [scaled(12), scaled(scaleNames.length <= 1 ? 12 : 8), 0, 0],
				focus: { alpha: 1 },
				cursor: { focus: { prox: 32 }, drag: { x: false, y: false, setScale: false } },
				plugins: [
					tooltipPlugin(),
					legendPlugin({ params: { showLegend }, overlayHandle }),
					labelsPlugin({ params: { showLegend } }),
				],
				axes: [
					{
						...axisDefaults(showGrid),
						space: 5 * ch,
						size: measureDigit().height + scaled(12),
						label: params.showXLabel ? '' : undefined,
						fullLabel: params.showXLabel ? 'years' : '',
					},
					...scaleNames.map(
						(scl, i) =>
							({
								...axisDefaults(showGrid && i < 1),
								scale: scl,
								show: i < 2,
								side: i === 0 ? 3 : 1,
								space: scaled(32),
								size: (u, vals) =>
									ch *
										Math.max.apply(
											null,
											vals?.map((v) => v.length),
										) +
									scale * 12,
								values: (u, vals) => vals.map((v) => v.toString()),
								fullLabel: scl === 'count' ? 'events count' : scl,
								label: '',
								incrs: [1, 2, 3, 4, 5, 10, 15, 20, 30, 50],
							}) as uPlot.Axis,
					),
				],
				series: [
					{},
					...seriesColors.map((col, i) => ({
						show: columnNames[i],
						label: `${columnNames[i]}${sampleNames[i]}`,
						legend: `${columnNames[i]}${sampleNames[i]}`,
						scale: params.historyOneAxis ? columnNames[0] : columnNames[i],
						stroke: color(col),
						width: scaled(1),
						marker: seriesMarkers[i],
						points: {
							show: showMarkers,
							stroke: color(col),
							fill: color(col),
							width: 0,
							paths: markersPaths(seriesMarkers[i], 8),
						},
					})),
				],
			} as Omit<uPlot.Options, 'width' | 'height'>;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [params, showLegend, showGrid, columns, samplesList, showMarkers]);

	return <ExportableUplot {...{ options, data }} />;
}

export const EventsHistory = {
	name: 'Events history',
	Panel,
	Menu,
	defaultParams,
	isPlot: true,
	isStat: true,
};
