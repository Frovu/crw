import { useMemo } from 'react';
import regression from 'regression';
import uPlot from 'uplot';
import { color, type Color } from '../../app/app';
import { type ContextMenuProps } from '../../app/layout';
import { Button } from '../../components/Button';
import { NumberInput } from '../../components/Input';
import { SimpleSelect } from '../../components/Select';
import { usePlot } from '../../events/core/plot';
import { useEventsSettings } from '../../events/core/util';
import { ExportableUplot } from '../../events/export/ExportableUplot';
import { apiPost } from '../../util';
import { usePlotOverlay } from '../common/plotOverlay';
import { pointPaths } from '../common/paths/pointPaths';
import { linePaths } from '../common/paths/linePaths';
import { axisDefaults, getFontSize, measureDigit, scaled } from '../common/plotUtil';
import { labelsPlugin, legendPlugin } from '../common/plugins/plugins';
import { titlePlugin } from '../common/plugins/titlePlugin';
import { Quadtree } from '../common/quadtree';
import { type CustomAxis } from '../common/types';
import { DefinitionInput } from '../../events/columns/Autocomplete';
import { useQuery } from '@tanstack/react-query';
import { useCrowWindowDebounced } from '../../crow/core/crowSettings';

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
	column0: null as string | null,
	column1: null as string | null,
	forceMin: null as number | null,
	forceMax: null as number | null,
	forceMinY: null as number | null,
	forceMaxY: null as number | null,
	color: 'green' as Color,
	showRegression: true,
	loglog: false,
	logx: true,
};

export type CorrelationParams = typeof defaultParams;

function Menu({ params, set, setParams, Checkbox }: ContextMenuProps<CorrelationParams>) {
	return (
		<>
			{columnKeys.map(([key, label]) => (
				<div key={key} className="flex gap-1">
					{label}:
					<DefinitionInput
						submitMode={true}
						className="w-52 h-6 pl-1"
						value={params[key] ?? ''}
						onChange={(val) => set(key, val)}
					/>
				</div>
			))}
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
			<div className="flex gap-3">
				color:
				<SimpleSelect
					className="bg-input-bg"
					value={params.color}
					onChange={(val) => set('color', val)}
					options={colors}
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
	const crowWindow = useCrowWindowDebounced();
	const params = usePlot<CorrelationParams>();

	const overlayHandle = usePlotOverlay((u, { width }) => ({
		x: (u.bbox.left + u.bbox.width - scaled(width)) / scaled(1) + 6,
		y: 3,
	}));

	const query = useQuery({
		queryKey: ['corr crow', params.column0, params.column1, crowWindow.start, crowWindow.end],
		queryFn: () =>
			apiPost<{ data: (number | null)[][] }>('events/plot', {
				interval: [crowWindow.start, crowWindow.end],
				definitions: [params.column0, params.column1],
			}),
	});

	const memo = useMemo(() => {
		if (!query.data) return null;
		const { loglog, logx, showRegression, forceMax, forceMaxY, forceMin, forceMinY } = params;

		const dt = query.data.data.slice(1);
		const filter: (i: number) => boolean = loglog
			? (i) => dt[0][i]! > 1 && dt[1][i]! > 1
			: (i) => dt[0][i]! != null && dt[1][i]! != null;
		const idxs = dt[0].map((_, i) => i).filter(filter);
		idxs.sort((a, b) => dt[0][a]! - dt[0][b]!);
		const data = dt.map((col) => idxs.map((i) => col[i])) as [number[], number[]];

		if (data[0].length < 8) return null;

		const minx = data[0][0];
		const maxx = data[0].at(-1)!;
		const miny = Math.min.apply(null, data[1]);
		const maxy = Math.max.apply(null, data[1]);

		const regrData = loglog ? data.map((col) => col.map((val) => Math.log(val))) : data;
		const regr = regression.linear(regrData[0].map((x, i) => [x, regrData[1][i]]) as any, { precision: 8 });
		const [gradient, intercept] = regr.equation;

		// standard error: https://en.wikipedia.org/wiki/Simple_linear_regression#Normality_assumption
		const meanX = regrData[0].reduce((a, b) => a + b, 0) / data.length;
		const sumE = regr.points.reduce((a, b) => a + b[1] * b[1], 0);
		const sdmX = regrData[0].reduce((a, b) => a + Math.pow(b - meanX, 2), 0);
		const err = Math.sqrt(sumE / sdmX / (regrData[0].length - 2));

		const regrPoints = Array(128)
			.fill(0)
			.map((_, i) => minx + (i * (maxx - minx)) / 128);
		const regrPredicts = regrPoints.map((x) =>
			loglog ? Math.pow(Math.E, regr.predict(Math.log(x))[1]) : regr.predict(x)[1],
		);

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
							fullLabel: 'X',
							label: '',
							size: getFontSize() + scaled(12),
							incrs: [1, 2, 3, 4, 5, 10, 15, 20, 30, 50, 100, 200, 500],
							...(logx && minx > 10 && maxx - minx < 1000 && { filter: (u, splits) => splits }),
							values: (u, vals) =>
								vals.map((v) =>
									loglog && logx
										? v?.toString().replace(/00+/, 'e' + v.toString().match(/00+/)?.[0].length)
										: v?.toString(),
								),
						},
						{
							...axisDefaults(showGrid),
							fullLabel: 'Y',
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
									loglog
										? v?.toString().replace(/00+/, 'e' + v.toString().match(/00+/)?.[0].length)
										: v?.toString(),
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
			data: [data, data, [regrPoints, regrPredicts]] as any, // UplotReact seems to not be aware of faceted plot mode
		};
	}, [query.data, params, showTitle, showLegend, overlayHandle, showGrid]);

	if (query.isLoading) return <div className="center">LOADING..</div>;
	if (query.error) throw query.error;
	if (!memo) return <div className="center">NOT ENOUGH DATA</div>;
	const { options, data } = memo;
	return (
		<>
			<ExportableUplot {...{ options, data }} />
		</>
	);
}

export const CorrelationCrow = {
	name: 'Correlation Crow',
	Panel,
	Menu,
	defaultParams,
	isPlot: true,
	isStat: true,
};
