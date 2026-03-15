import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import uPlot from 'uplot';
import type { ContextMenuProps } from '../../layout';
import { useFeidInfo } from '../../events/core/query';
import { useTable } from '../../events/core/editableTables';
import { PlotIntervalInput } from '../../components/Input';
import { Button } from '../../components/Button';
import { color } from '../../app';
import { SimpleSelect } from '../../components/Select';
import { apiPost, cn } from '../../util';
import { useSampleOptions, type SampleOption } from './statPlotUtils';
import { useFeidSample } from '../../events/core/feid';
import { useEventsSettings } from '../../events/core/util';
import { usePlot } from '../../events/core/plot';
import { applySample } from '../../events/sample/sample';
import { ExportableUplot } from '../../events/export/ExportableUplot';
import { tooltipPlugin, legendPlugin, labelsPlugin, type CustomAxis, type CustomScale } from '../basicPlot';
import { usePlotOverlay, scaled, getParam, measureDigit, axisDefaults } from '../plotUtil';

const colors = ['green', 'purple', 'magenta'];
const seriesKeys = ['series0', 'series1', 'series2'] as const;
const sampleKeys = ['sample0', 'sample1', 'sample2'] as const;

const defaultParams = {
	timeColumn: 'time',
	series0: 'a10m' as null | string,
	series1: null as null | string,
	series2: null as null | string,
	sample0: '<current>' as SampleOption,
	sample1: '<current>' as SampleOption,
	sample2: '<current>' as SampleOption,
	logScale: false,
	showEpochMedian: false,
	showEpochStd: true,
	showXLabel: false,
};

export type CollisionOptions = typeof defaultParams;

function Menu({ params, set, Checkbox }: ContextMenuProps<CollisionOptions>) {
	const { series: seriesOptions } = useFeidInfo();
	const { columns } = useTable('feid');
	const sampleOpts = useSampleOptions();
	const timeOptions = columns.filter((col) => col.dtype === 'time');

	return (
		<>
			{['A', 'B', 'C'].map((letter, i) => (
				<div key={letter} className="flex gap-3">
					<Button
						title="Reset"
						style={{ color: color(colors[i]) }}
						onClick={() => {
							set(seriesKeys[i], null);
							set(sampleKeys[i], '<current>');
						}}
					>
						{letter}:
					</Button>
					<SimpleSelect
						title="Data series"
						className={cn('w-20', params[seriesKeys[i]] == null && 'text-dark')}
						options={[
							[null, '<none>'],
							...seriesOptions.map((ser) => [ser.name, ser.display_name] as [string, string]),
						]}
						value={params[seriesKeys[i]] ?? null}
						onChange={(val) => set(seriesKeys[i], val)}
					/>
					:
					<SimpleSelect
						title="Sample (none = all events)"
						className={cn('w-30', params[seriesKeys[i]] == null && 'text-dark')}
						options={sampleOpts}
						value={params[sampleKeys[i]]}
						onChange={(val) => set(sampleKeys[i], val)}
					/>
				</div>
			))}
			<div className="flex">
				Time source:
				<SimpleSelect
					className="w-30"
					value={params.timeColumn}
					onChange={(val) => set('timeColumn', val)}
					options={timeOptions.map((col) => [col.sql_name, col.name])}
				/>
			</div>
			<div className="flex gap-3">
				<PlotIntervalInput />
			</div>
			<div className="flex gap-3">
				<Checkbox label="Plot median" k="showEpochMedian" />
				<Checkbox label="std error" k="showEpochStd" />
			</div>
			<div className="flex gap-3">
				<Checkbox label="Show X label" k="showXLabel" />
				<Checkbox label="Log scale" k="logScale" />
			</div>
		</>
	);
}

function Panel() {
	const { data: currentData, samples: samplesList } = useFeidSample();
	const { plotOffset, showGrid, showLegend } = useEventsSettings();
	const { series: seriesList } = useFeidInfo();
	const { data: allData, columns } = useTable('feid');
	const params = usePlot<CollisionOptions>();
	const { sample0, sample1, sample2, timeColumn } = params;

	const series = [params.series0, params.series1, params.series2];
	const samples = useMemo(
		() =>
			[sample0, sample1, sample2].map((id) => {
				if (id === '<current>') return currentData;
				if (id === '<none>') return allData;
				const found = samplesList?.find((s) => s.id === id);
				return found ? applySample(allData, found, columns, samplesList!) : null;
			}),
		[sample0, sample1, sample2, currentData, allData, samplesList, columns],
	);

	const overlayHandle = usePlotOverlay((u, { width }) => ({
		x: (u.bbox.left + u.bbox.width - scaled(width)) / scaled(1),
		y: u.bbox.top / scaled(1) + 8,
	}));

	const queryHandler = async (qi: number, timeColIdx: number) => {
		const sample = samples[qi];
		const interval = plotOffset,
			uri = 'events/epoch_collision';
		const times = sample!
			.map((row) => row[timeColIdx])
			.filter((t): t is Date => t as any)
			.map((t) => Math.floor(t.getTime() / 36e5) * 3600);

		type Res = { offset: number[]; mean: number[]; median: number[]; std: number[] };
		const { offset, median, mean, std } = await apiPost<Res>(uri, { times, interval, series: series[qi] });
		return [
			offset,
			median,
			mean,
			std.map((s, i, all) => mean[i] + s / Math.sqrt(all.length)),
			std.map((s, i, all) => mean[i] - s / Math.sqrt(all.length)),
			times,
		];
	};

	const qk = ['epochCollision', ...plotOffset, timeColumn];
	const timeColIdx = columns.findIndex((c) => c.sql_name === timeColumn);
	const queries = useQueries({
		queries: [
			// yes, query keys are cursed
			{
				enabled: !!series[0] && !!samples[0]?.length,
				queryKey: [...qk, samples[0]?.length, samples[0]?.at(0), samples[0]?.at(-1), series[0], timeColIdx],
				queryFn: () => queryHandler(0, timeColIdx),
				staleTime: Infinity,
			},
			{
				enabled: !!series[1] && !!samples[1]?.length,
				queryKey: [...qk, samples[1]?.length, samples[1]?.at(0), samples[1]?.at(-1), series[1], timeColIdx],
				queryFn: () => queryHandler(1, timeColIdx),
				staleTime: Infinity,
			},
			{
				enabled: !!series[2] && !!samples[2]?.length,
				queryKey: [...qk, samples[2]?.length, samples[2]?.at(0), samples[2]?.at(-1), series[2], timeColIdx],
				queryFn: () => queryHandler(2, timeColIdx),
				staleTime: Infinity,
			},
		],
	});

	const { data, options } = useMemo(() => {
		// FIXME: offset (x) is assumed to be the same on all queries
		const time = queries.find((q) => q.data)?.data?.[0];
		const timeShifted = time?.map((t) => t + (time[1] - time[0]) / 2);
		const sampleNames = [sample0, sample1, sample2].map((id) =>
			['<current>', '<none>'].includes(id as any)
				? ''
				: ' of ' + (samplesList?.find((s) => s.id.toString() === id)?.name ?? 'UNKNOWN'),
		);
		const seriesNames = series.map((serName) => seriesList.find((ser) => ser.name === serName)?.display_name ?? '???');

		return {
			data: [
				timeShifted,
				...(queries[0].data?.slice(1, -1) || []),
				...(queries[1].data?.slice(1, -1) || []),
				...(queries[2].data?.slice(1, -1) || []),
			] as any,
			options: () => {
				const scaleOverrides = getParam('scalesParams');
				const filtered = queries.map((q, i) => (q.data ? i : null)).filter((q) => q != null) as number[];
				const axScale = (idx: number) => {
					const ser = seriesList.find((s) => s.name === series[idx])?.display_name;
					return 'e_' + (ser?.startsWith('B') ? 'B' : ser?.startsWith('A0') ? 'A0' : ser);
				};
				const ch = measureDigit().width,
					scale = scaled(1);
				return {
					padding: [scaled(10), scaled(4), 0, 0],
					focus: { alpha: 1 },
					cursor: { focus: { prox: 24 }, drag: { x: false, y: false, setScale: false } },
					plugins: [
						tooltipPlugin(),
						legendPlugin({ params: { showLegend }, overlayHandle }),
						labelsPlugin({ params: { showLegend } }),
					],
					axes: [
						{
							...axisDefaults(showGrid),
							size: measureDigit().height + scaled(12),
							space: ch * 4 + scaled(4),
							label: params.showXLabel ? '' : undefined,
							fullLabel: params.showXLabel ? 'time from onset, h' : '',
						},
						...(filtered.map((idx, i) => ({
							...axisDefaults(showGrid && i === 0),
							side: i === 0 ? 3 : 1,
							show: i !== filtered.findIndex((id) => axScale(id) === axScale(idx)) || i === 2 ? false : true,
							space: scaled(32),
							size: (u, vals) =>
								ch *
									(Math.max.apply(
										null,
										vals?.map((v) => v?.length),
									) || 4) +
								scale * 12,
							values: (u, vals) => vals.map((v) => v?.toString()),
							scale: axScale(idx),
							fullLabel: filtered
								.filter((id) => axScale(id) === axScale(idx))
								.map((id) => seriesNames[idx])
								.join(', '),
							label: '',
						})) as CustomAxis[]),
					],
					scales: {
						x: { time: false },
						...Object.fromEntries(
							filtered.map((idx, i) => [
								axScale(idx),
								{
									distr: params.logScale ? 3 : 1,
									range: (u, dmin, dmax) => {
										const override = scaleOverrides?.[axScale(idx)!];
										const pmin = override?.min ?? dmin - 0.0001;
										const min = params.logScale ? Math.max(0.01, pmin) : pmin;
										const max = override?.max ?? dmax + 0.0001;
										const [bottom, top] =
											!params.logScale && override ? [override.bottom, override.top] : [0, 1];
										const scl: CustomScale = u.scales[axScale(idx)!];
										scl.scaleValue = { min, max };
										scl.positionValue = { bottom, top };
										const h = max - min;
										const resultingH = h / (top - bottom);
										const margin = params.logScale ? 0 : h / 10;
										return [
											min - resultingH * bottom - (!override && bottom === 0 ? margin : 0),
											max + resultingH * (1 - top) + (!override && top === 1 ? margin : 0),
										];
									},
								} as CustomScale,
							]),
						),
					},
					series: [
						{},
						...filtered
							.map(
								(idx, i) =>
									[
										{
											show: params.showEpochMedian,
											scale: axScale(idx),
											label: 'median ' + seriesNames[idx],
											stroke: color(colors[idx], 0.7),
											width: scaled(2),
											points: { show: false },
										},
										{
											legend: seriesNames[idx] + sampleNames[idx],
											label: seriesNames[idx],
											scale: axScale(idx),
											stroke: color(colors[idx]),
											width: scaled(3),
											value: (u, val) => val?.toFixed(2),
											points: { show: false },
										},
										{
											show: params.showEpochStd,
											label: seriesNames[idx] + ' + std',
											scale: axScale(idx),
											stroke: color(colors[idx]),
											width: scaled(0.9),
											points: { show: false },
										},
										{
											show: params.showEpochStd,
											label: seriesNames[idx] + ' - std',
											scale: axScale(idx),
											stroke: color(colors[idx]),
											width: scaled(0.9),
											points: { show: false },
										},
									] as uPlot.Series[],
							)
							.flat(),
					],
				} as Omit<uPlot.Options, 'width' | 'height'>;
			},
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		params.showEpochMedian,
		params.showEpochStd,
		params.showXLabel,
		params.logScale,
		queries[0].data, // eslint-disable-line react-hooks/exhaustive-deps
		queries[1].data, // eslint-disable-line react-hooks/exhaustive-deps
		queries[2].data, // eslint-disable-line react-hooks/exhaustive-deps
		samples,
		showGrid,
		showLegend,
	]);

	if (queries.some((q) => q.isError))
		return (
			<div className="Center" style={{ color: color('red') }}>
				FAILED TO LOAD
			</div>
		);
	if (queries.some((q) => !q.data && q.isLoading)) return <div className="Center">LOADING...</div>;
	if (!queries.some((q) => q.data)) return <div className="Center">EMPTY SAMPLE</div>;
	return (
		<>
			<ExportableUplot {...{ options, data }} />
			<div className="absolute top-[1px] right-[3px] text-xs text-dark bg-bg">
				{queries
					.map(
						(q, i) =>
							q.data && (
								<span key={sampleKeys[i]} style={{ color: color(colors[i]) }}>
									{q.data.at(-1)?.length}
								</span>
							),
					)
					.filter((a) => a)
					.reduce((a, b) => [a, '/', b] as any)}
			</div>
		</>
	);
}

export const SuperposedEpochs = {
	name: 'Superposed epochs',
	Panel,
	Menu,
	defaultParams,
	isPlot: true,
	isStat: true,
};
