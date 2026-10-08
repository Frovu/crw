import { useMemo } from 'react';
import regression from 'regression';
import uPlot from 'uplot';
import { color, type Color } from '../../app/app';
import { type ContextMenuProps } from '../../app/layout';
import { Button } from '../../components/Button';
import { NumberInput } from '../../components/Input';
import { SimpleSelect } from '../../components/Select';
import { useTable } from '../../events/core/editableTables';
import { useEventsState } from '../../events/core/eventsState';
import { useFeidSample, useFeidTableView } from '../../events/core/feid';
import { usePlot } from '../../events/core/plot';
import { equalValues, useEventsSettings, valueToString } from '../../events/core/util';
import { ExportableUplot } from '../../events/export/ExportableUplot';
import { applySample } from '../../events/sample/sample';
import { cn, prettyDate } from '../../util';
import { usePlotOverlay } from '../common/plotOverlay';
import { pointPaths } from '../common/paths/pointPaths';
import { linePaths } from '../common/paths/linePaths';
import { axisDefaults, getFontSize, measureDigit, scaled } from '../common/plotUtil';
import { labelsPlugin, legendPlugin } from '../common/plugins/plugins';
import { titlePlugin } from '../common/plugins/titlePlugin';
import { tooltipPlugin } from '../common/plugins/tooltipPlugin';
import { Quadtree } from '../common/quadtree';
import { type CustomAxis } from '../common/types';
import { useColumnOptions, useSampleOptions, type SampleOption } from './statPlotUtils';
import ColorSelect from '../../components/ColorSelect';
import { computeR2Score, LinearRegression } from './regression';
import CorrelationMatrix from './CorrelationMatrix';

const colors = ['magenta', 'gold', 'cyan', 'green'] as const;

const limitKeys = [
	['X', 'forceMin', 'forceMax'],
	['Y', 'forceMinY', 'forceMaxY'],
] as const;

const corrModes = ['plot', 'matrix'] as const;

type CorrY = {
	color: Color;
	sample: SampleOption;
	column: string;
};

const defaultParams = {
	correlationX: [] as string[],
	correlationY: [] as CorrY[],
	correlationMode: 'plot' as (typeof corrModes)[number],
	forceMin: null as number | null,
	forceMax: null as number | null,
	forceMinY: null as number | null,
	forceMaxY: null as number | null,
	showRegression: true,
	loglog: false,
	logx: true,
};

export type CorrelationParams = typeof defaultParams;

function Menu({ params, set, setParams, Checkbox }: ContextMenuProps<CorrelationParams>) {
	const sampleOpts = useSampleOptions();
	const columnOpts = useColumnOptions(['integer', 'real'], [...params.correlationX, ...params.correlationY.map((c) => c.column)]);
	const { correlationX: corrX, correlationY: corrY } = params;

	const setX = (prev: string | null, val: string | null) =>
		set(
			'correlationX',
			prev ? (val ? corrX.map((c) => (c === prev ? val : c)) : corrX.filter((c) => c !== prev)) : val ? [...corrX, val] : corrX,
		);

	const setY = <K extends keyof CorrY>(col: CorrY, key: K, val: CorrY[K]) =>
		set(
			'correlationY',
			corrY.map((c) => (c.column === col.column ? { ...c, [key]: val } : c)),
		);

	const addY = (column: string) =>
		set('correlationY', [
			...corrY,
			{ color: colors.find((clr) => !corrY.find((c) => c.color === clr)) ?? 'white', column, sample: '<current>' },
		]);

	const rmY = (col: CorrY) =>
		set(
			'correlationY',
			corrY.filter((c) => c.column !== col.column),
		);

	return (
		<>
			{[...corrX, null].map((colName, i) => (
				<div key={colName} className="flex gap-1">
					<Button title="Remove" className={!colName ? 'text-dark' : ''} onClick={() => setX(colName, null)}>
						X{i + 1}:
					</Button>
					<SimpleSelect
						className="w-30 bg-input-bg"
						value={colName}
						onChange={(val) => setX(colName, val)}
						options={[...(colName ? [[null, '<clear>'] as const] : []), ...columnOpts.map((col) => [col.sql_name, col.name] as const)]}
					/>
				</div>
			))}
			{[...corrY, null].map((col, i) => (
				<div className="flex gap-1 items-center">
					<ColorSelect disabled={!col} value={col?.color ?? 'dark'} onChange={(val) => setY(col!, 'color', val)} />
					<SimpleSelect
						title="Sample (none = all events)"
						className={cn('bg-input-bg w-30', col?.sample === '<current>' && 'text-dark')}
						value={col?.sample ?? '<current>'}
						onChange={(val) => setY(col!, 'sample', val)}
						disabled={!col}
						options={sampleOpts}
					/>
					<Button title="Remove" className={!col ? 'text-dark' : ''} onClick={() => col && rmY(col)}>
						Y{i + 1}:
					</Button>
					<SimpleSelect
						className="w-30 bg-input-bg"
						value={col?.column ?? null}
						onChange={(val) => (!col ? addY(val!) : val ? setY(col, 'column', val) : rmY(col))}
						options={[...(col ? [[null, '<clear>'] as const] : []), ...columnOpts.map((col) => [col.sql_name, col.name] as const)]}
					/>
				</div>
			))}
			<div className="flex gap-1"></div>
			{limitKeys.map(([label, kmin, kmax]) => (
				<div key={label} className="flex gap-1 h-6">
					<Button title="Reset limits" onClick={() => setParams({ [kmin]: null, [kmax]: null })}>
						Limit {label}:
					</Button>
					<NumberInput className="w-12" value={params[kmin]} onChange={(val) => set(kmin, val)} allowNull={true} />
					;
					<NumberInput className="w-12" value={params[kmax]} onChange={(val) => set(kmax, val)} allowNull={true} />
				</div>
			))}
			<div className="flex items-center">
				Display mode:
				<SimpleSelect
					className="w-24"
					value={params.correlationMode}
					onChange={(val) => set('correlationMode', val)}
					options={corrModes.map((m) => [m, m] as const)}
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
	const { data: shownData } = useFeidTableView();
	const { data: allData, columns, index } = useTable('feid');
	const { data: currentData, samples: samplesList } = useFeidSample();
	const params = usePlot<CorrelationParams>();

	const overlayHandle = usePlotOverlay((u, { width }) => ({
		x: (u.bbox.left + u.bbox.width - scaled(width)) / scaled(1) + 6,
		y: 3,
	}));

	const sets = useMemo(() => {
		return params.correlationY
			.map(({ column, sample }) => {
				const sd = sample === '<current>' ? currentData : sample === '<none>' ? allData : null;
				const sampleData = (sd ??
					applySample(allData, samplesList?.find((s) => s.id === sample) ?? null, columns, samplesList ?? [])) as number[][];

				if (!sampleData.length) return null;
				const colIdx = [column, ...params.correlationX].map((c) => columns.findIndex((cc) => cc.sql_name === c));
				if (colIdx.includes(-1)) throw new Error('Column not found');
				const cols = colIdx.map((c) => columns[c]);

				// const filter = loglog ? (r: number[]) => r.every((v) => v > 1) : (r: number[]) => r.every((v) => v != null);
				const filtered = sampleData.filter((row) => colIdx.every((i) => row[i] != null));
				const Y = filtered.map((row) => row[colIdx[0]]);
				const X = filtered.map((row) => colIdx.slice(1).map((i) => row[i]));
				// .sort((a, b) => a[0] - b[0]);
				// const plotData = [0, 1].map((i) => data.map((r) => r[i]));

				if (filtered.length < 8) return null;

				// const minx = data[0][0];
				// const maxx = data[data.length - 1][0];
				// const miny = Math.min.apply(null, plotData[1]);
				// const maxy = Math.max.apply(null, plotData[1]);

				console.log(1);
				const regr = new LinearRegression();
				regr.fit(X, Y);

				console.log(2);
				console.log('Intercept:', regr.weights[0]);
				console.log('Coefficients:', regr.weights.slice(1));
				// console.log(regr.predict([[15, 700]]));

				const errors = regr.computeStandardErrors(X, Y);
				console.log(3);
				const predictions = regr.predict(X);
				console.log(4);
				const R2 = computeR2Score(Y, predictions);
				console.log(5);

				return { X, Y, predictions, errors, R2, cols };
			})
			.filter((y) => !!y);
	}, [allData, columns, currentData, params.correlationX, params.correlationY, samplesList]);

	const memo = useMemo(() => {
		const { correlationX, correlationY, loglog, logx, showRegression, forceMax, forceMaxY, forceMin, forceMinY } = params;

		// const maxWidthY = loglog ? 3 : Math.max(...[miny, maxy].map(Math.abs).map(v => v.toFixed(0).length));

		// const findRow = (i: number) => sampleData.find((row) => equalValues(row[colIdx[0]], data[i][0]) && equalValues(row[colIdx[1]], data[i][1]));
		return;
		return {
			options: () => {
				let hoveredRect: any;
				let qt: Quadtree;
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
						dataIdx: (u) => {
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
							onclick: (u, didx) => {
								const row = findRow(didx);
								if (!row) return;
								setCursor({
									row: shownData.findIndex((r) => r[0] === row[0]),
									column: 1,
									entity: 'feid',
									id: row[0],
								});
								setPlotId(() => row[0]);
							},
							html: (u, sidx, didx) => {
								const row = findRow(didx);
								return row
									? `${prettyDate(row[index.time] as any)}; ${valueToString(row[colIdx[0]])}, ${valueToString(row[colIdx[1]])}`
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
									loglog && logx ? v?.toString().replace(/00+/, 'e' + v.toString().match(/00+/)?.[0].length) : v?.toString(),
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
												values.map((v) => v?.toString().length ?? 0),
											)
										: 4),
							incrs: [1, 2, 3, 4, 5, 10, 15, 20, 30, 50, 100, 200, 500, 1000, 10000, 100000, 1000000],
							values: (u, vals) =>
								vals.map((v) =>
									loglog ? v?.toString().replace(/00+/, 'e' + v.toString().match(/00+/)?.[0].length) : v?.toString(),
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
										: samplesList?.find((s) => s.id === sample0)?.name,
							marker: 'circle',
							bars: true,
							stroke: color(params.color),
							paths: pointPaths(scaled(4), (r: any) => qt.add(r)),
						},
						{
							label: '',
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

	if (params.correlationMode === 'matrix') return <CorrelationMatrix sets={sets} />;

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
