import { useContext, useEffect, useMemo } from 'react';
import regression from 'regression';
import uPlot from 'uplot';
import { legendPlugin, titlePlugin, tooltipPlugin, type CustomAxis, labelsPlugin } from '../basicPlot';
import { useFeidSample, useFeidTableView } from '../../events/core/feid';
import { useTable } from '../../events/core/editableTables';
import { LayoutContext, type ContextMenuProps, type LayoutContextType } from '../../layout';
import { SimpleSelect } from '../../components/Select';
import { Button } from '../../components/Button';
import { cn, prettyDate } from '../../util';
import { NumberInput } from '../../components/Input';
import { useEventsState } from '../../events/core/eventsState';
import { usePlot } from '../../events/core/plot';
import { useEventsSettings, equalValues, valueToString } from '../../events/core/util';
import { ExportableUplot } from '../../events/export/ExportPlot';
import { applySample } from '../../events/sample/sample';
import { pointPaths, linePaths } from '../plotPaths';
import { usePlotOverlay, scaled, measureDigit, axisDefaults, getFontSize } from '../plotUtil';
import { Quadtree } from '../quadtree';
import { color } from '../../app';

const colors = ['magenta', 'gold', 'cyan', 'green'] as const;

const columnKeys = [
	['column0', 'X'],
	['column1', 'Y'],
] as const;

const limitKeys = [
	['X', 'forceMin', 'forceMax'],
	['Y', 'forceMinY', 'forceMaxY'],
] as const;

const defaultParams = {
	sample0: '<current>' as '<current>' | '<none>' | string,
	column0: null as string | null,
	column1: null as string | null,
	forceMin: null as number | null,
	forceMax: null as number | null,
	forceMinY: null as number | null,
	forceMaxY: null as number | null,
	color: 'green',
	showRegression: true,
	loglog: false,
	logx: true,
};

export type CorrelationParams = {
	sample0: '<current>' | '<none>' | string;
	column0: string | null;
	column1: string | null;
	forceMin: number | null;
	forceMax: number | null;
	forceMinY: number | null;
	forceMaxY: number | null;
	color: string;
	showRegression: boolean;
	loglog: boolean;
	logx: boolean;
};

function Menu({ params, setParams, Checkbox }: ContextMenuProps<CorrelationParams>) {
	const { columns } = useTable('feid');
	const { samples } = useFeidSample();
	const shownColumns = useEventsSettings((st) => st.shownColumns);
	const columnOpts = columns.filter(
		(col) =>
			(['integer', 'real'].includes(col.dtype) && shownColumns?.includes(col.sql_name)) ||
			(['column0', 'column1'] as const).some((p) => params[p] === col.sql_name)
	);
	const set = <T extends keyof CorrelationParams>(k: T, val: CorrelationParams[T]) => setParams({ [k]: val });

	const sampleOpts = [
		['<none>', '<none>'],
		['<current>', '<current>'],
		...(samples?.map((sm) => [sm.id.toString(), sm.name]) ?? []),
	] as [string, string][];

	return (
		<>
			<div className="flex gap-1">
				<Button title="Reset" onClick={() => set('sample0', '<current>')}>
					Sample:
				</Button>
				<SimpleSelect
					title="Sample (none = all events)"
					className={cn('bg-input-bg w-30', params.sample0 === '<current>' && 'text-dark')}
					value={params.sample0}
					onChange={(val) => set('sample0', val)}
					options={sampleOpts}
				/>
			</div>
			{columnKeys.map(([key, label]) => (
				<div key={key} className="flex gap-1">
					{label}:
					<SimpleSelect
						className="w-30 bg-input-bg"
						value={params[key]}
						onChange={(val) => set(key, val)}
						options={columnOpts.map((col) => [col.sql_name, col.name])}
					/>
				</div>
			))}
			{limitKeys.map(([label, kmin, kmax]) => (
				<div key="label" className="flex gap-1 h-6">
					<Button title="Reset limits" onClick={() => setParams({ [kmin]: null, [kmax]: null })}>
						Limit {label}:
					</Button>
					<NumberInput className="w-12" value={params[kmin]} onChange={(val) => set(kmin, val)} allowNull={true} />
					;
					<NumberInput className="w-12" value={params[kmax]} onChange={(val) => set(kmax, val)} allowNull={true} />
				</div>
			))}
			<div className="flex gap-3">
				color:
				<SimpleSelect
					className="bg-input-bg"
					value={params.color}
					onChange={(val) => set('color', val)}
					options={colors.map((c) => [c, c])}
				/>
			</div>
			<div className="flex gap-3">
				<Checkbox label="regression" k="showRegression" />
				<Checkbox label="loglog" k="loglog" />
				<Checkbox label="logx" k="logx" />
			</div>
		</>
	);
}

function Panel() {
	const { showGrid, showLegend, showTitle } = useEventsSettings();
	const { setCursor, setPlotId } = useEventsState();
	const { setParams } = useContext(LayoutContext)! as LayoutContextType<CorrelationParams>;
	const { data: shownData } = useFeidTableView();
	const { data: allData, columns, index } = useTable('feid');
	const { data: currentData, samples: samplesList } = useFeidSample();
	const params = usePlot<CorrelationParams>();

	const overlayHandle = usePlotOverlay((u, { width }) => ({
		x: (u.bbox.left + u.bbox.width - scaled(width)) / scaled(1) + 6,
		y: 3,
	}));

	useEffect(() => {
		for (const k of ['column0', 'column1'] as (keyof CorrelationParams)[]) {
			if (params[k] == null)
				setParams({ [k]: columns.find((col) => col.name === (k === 'column0' ? 'VmBm' : 'magnitude'))?.sql_name });
		}
	}, [params, columns]); // eslint-disable-line react-hooks/exhaustive-deps

	const memo = useMemo(() => {
		const { loglog, logx, showRegression, forceMax, forceMaxY, forceMin, forceMinY, sample0 } = params;

		const sampleData =
			sample0 === '<current>'
				? currentData
				: sample0 === '<none>'
				? allData
				: applySample(
						allData,
						samplesList?.find((s) => s.id.toString() === sample0) ?? null,
						columns,
						samplesList ?? []
				  );

		if (!sampleData.length) return null;
		const colIdx = ['column0', 'column1'].map((c) =>
			columns.findIndex((cc) => cc.sql_name === params[c as keyof CorrelationParams])
		);
		if (colIdx.includes(-1)) return null;
		const [colX, colY] = colIdx.map((c) => columns[c]);
		if (!['integer', 'real'].includes(colX.type) || !['integer', 'real'].includes(colY.type)) return null;

		const filter = loglog ? (r: number[]) => r[0] > 1 && r[1] > 1 : (r: number[]) => r[0] != null && r[1] != null;
		const data = (sampleData as number[][])
			.map((row) => colIdx.map((i) => row[i]))
			.filter(filter)
			.sort((a, b) => a[0] - b[0]);
		const plotData = [0, 1].map((i) => data.map((r) => r[i]));

		if (data.length < 8) return null;

		const minx = data[0][0];
		const maxx = data[data.length - 1][0];
		const miny = Math.min.apply(null, plotData[1]);
		const maxy = Math.max.apply(null, plotData[1]);

		const regrData = loglog ? data.map((r) => [Math.log(r[0]), Math.log(r[1])]) : data;
		const regr = regression.linear(regrData as any, { precision: 8 });
		const [gradient, intercept] = regr.equation;

		// standard error: https://en.wikipedia.org/wiki/Simple_linear_regression#Normality_assumption
		const meanX = regrData.reduce((a, b) => a + b[0], 0) / data.length;
		const sumE = regr.points.reduce((a, b) => a + b[1] * b[1], 0);
		const sdmX = regrData.reduce((a, b) => a + Math.pow(b[0] - meanX, 2), 0);
		const err = Math.sqrt(sumE / sdmX / (data.length - 2));

		const regrPoints = Array(128)
			.fill(0)
			.map((_, i) => minx + (i * (maxx - minx)) / 128);
		const regrPredicts = regrPoints.map((x) =>
			loglog ? Math.pow(Math.E, regr.predict(Math.log(x))[1]) : regr.predict(x)[1]
		);
		// const maxWidthY = loglog ? 3 : Math.max(...[miny, maxy].map(Math.abs).map(v => v.toFixed(0).length));

		const findRow = (i: number) =>
			sampleData.find((row) => equalValues(row[colIdx[0]], data[i][0]) && equalValues(row[colIdx[1]], data[i][1]));

		let hoveredRect: any;
		let qt: Quadtree;
		return {
			options: () => {
				const ch = measureDigit().width,
					scale = scaled(1);
				return {
					mode: 2,
					padding: [8, 12, 0, 0].map((p) => scaled(p)) as any,
					focus: { alpha: 1 },
					cursor: {
						drag: { x: false, y: false, setScale: false },
						points: {
							width: 2,
							size: 6,
							stroke: (u, sidx) => (sidx === 1 ? color('red') : 'transparent'),
							fill: 'transparent',
						},
						dataIdx: (u, sidx) => {
							const cx = u.cursor.left! * devicePixelRatio;
							const cy = u.cursor.top! * devicePixelRatio;
							hoveredRect = null;
							qt.hover(cx, cy, (o: any) => {
								hoveredRect = o;
							});
							return hoveredRect?.didx ?? -1;
						},
					},
					plugins: [
						tooltipPlugin({
							didx: () => hoveredRect?.didx,
							onclick: (u, didx) => {
								const row = findRow(didx);
								if (!row) return;
								setCursor({
									row: shownData.findIndex((r) => r[0] === row[0]),
									column: 0,
									entity: 'feid',
									id: row[0],
								});
								setPlotId(() => row[0]);
							},
							html: (u, sidx, didx) => {
								const row = findRow(didx);
								return row
									? `${prettyDate(row[index.time] as any)}; ${valueToString(row[colIdx[0]])}, ${valueToString(
											row[colIdx[1]]
									  )}`
									: '??';
							},
						}),
						titlePlugin({
							text: [
								{ text: `α=${intercept.toFixed(2)}; `, color: 'dark' },
								{
									text: `β=${gradient.toFixed(3)} ± ${err.toFixed(3)}; r=${Math.sqrt(regr.r2).toFixed(2)}`,
									color: 'text',
								},
							],
							params: { showTitle: showTitle && !!regr },
						}),
						legendPlugin({
							params: { showLegend },
							overlayHandle,
						}),
						labelsPlugin({ params: { showLegend } }),
					],
					hooks: {
						drawClear: [
							(u) => {
								qt = new Quadtree(0, 0, u.bbox.width, u.bbox.height);
								qt.clear();
							},
						],
					},
					axes: [
						{
							...axisDefaults(showGrid),
							space: getFontSize() * 2.5,
							fullLabel: colX.name,
							label: '',
							size: getFontSize() + scaled(12),
							incrs: [1, 2, 3, 4, 5, 10, 15, 20, 30, 50, 100, 200, 500],
							...(logx && minx > 10 && maxx - minx < 1000 && { filter: (u, splits) => splits }),
							values: (u, vals) =>
								vals.map((v) =>
									loglog && logx
										? v?.toString().replace(/00+/, 'e' + v.toString().match(/00+/)?.[0].length)
										: v?.toString()
								),
						},
						{
							...axisDefaults(showGrid),
							fullLabel: colY.name,
							label: '',
							size: (u, values) =>
								scale * 12 +
								ch *
									(values
										? Math.max.apply(
												null,
												values.map((v) => v?.toString().length ?? 0)
										  )
										: 4),
							incrs: [1, 2, 3, 4, 5, 10, 15, 20, 30, 50, 100, 200, 500, 1000, 10000, 100000, 1000000],
							values: (u, vals) =>
								vals.map((v) =>
									loglog
										? v?.toString().replace(/00+/, 'e' + v.toString().match(/00+/)?.[0].length)
										: v?.toString()
								),
						} as CustomAxis,
					],
					scales: {
						x: {
							time: false,
							distr: logx && loglog ? 3 : 1,
							range: [forceMin ?? minx, forceMax ?? maxx],
						},
						y: {
							distr: loglog ? 3 : 1,
							range: [forceMinY ?? miny, forceMaxY ?? maxy],
						},
					},
					series: [
						{ facets: [{ scale: 'x', auto: true }] },
						{
							facets: [
								{ scale: 'x', auto: true },
								{ scale: 'y', auto: true },
							],
							label: 'scatter',
							legend:
								sample0 === '<current>'
									? undefined
									: sample0 === '<none>'
									? 'all events'
									: samplesList?.find((s) => s.id.toString() === sample0)?.name,
							marker: 'circle',
							bars: true,
							stroke: color(params.color),
							paths: pointPaths(scaled(4), (r: any) => qt.add(r)),
						},
						{
							facets: [
								{ scale: 'x', auto: true },
								{ scale: 'y', auto: true },
							],
							show: showRegression,
							stroke: color('white'),
							paths: linePaths(scaled(1.5)),
						},
					],
				} as Omit<uPlot.Options, 'width' | 'height'>;
			},
			data: [plotData, plotData, [regrPoints, regrPredicts]] as any, // UplotReact seems to not be aware of faceted plot mode
		};
	}, [
		params,
		currentData,
		allData,
		samplesList,
		columns,
		showTitle,
		showLegend,
		overlayHandle,
		showGrid,
		setCursor,
		shownData,
		setPlotId,
		index.time,
	]);

	if (!memo) return <div className="center">NOT ENOUGH DATA</div>;
	const { options, data } = memo;
	return (
		<>
			<ExportableUplot {...{ options, data }} />
		</>
	);
}

export const Correlation = {
	name: 'Correlation',
	Panel,
	Menu,
	defaultParams,
	isPlot: true,
	isStat: true,
};
