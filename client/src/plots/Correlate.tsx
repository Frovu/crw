import { useContext, useEffect, useMemo } from 'react';
import regression from 'regression';
import { linePaths, pointPaths } from './plotPaths';
import { axisDefaults, color, getFontSize, measureDigit, scaled, usePlotOverlay } from './plotUtil';
import { MainTableContext, SampleContext, useEventsSettings, equalValues, valueToString, TableViewContext, usePlotParams, findColumn } from '../events/events';
import { LayoutContext, type ContextMenuProps, type LayoutContextType } from '../layout';
import { ExportableUplot } from '../events/ExportPlot';
import uPlot from 'uplot';
import { legendPlugin, titlePlugin, tooltipPlugin, type CustomAxis, labelsPlugin } from './basicPlot';
import { Quadtree } from './quadtree';
import { prettyDate } from '../util';
import { NumberInput } from '../Utility';
import { applySample } from '../events/sample';
import { useEventsState, useTable } from '../events/eventsState';

const colors = ['magenta', 'gold', 'cyan', 'green'];

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

function Menu({ params, setParams }: ContextMenuProps<CorrelationParams>) {
	const { columns } = useContext(MainTableContext);
	const { samples } = useContext(SampleContext);
	const { shownColumns } = useEventsSettings();
	const columnOpts = columns.filter(
		(c) => (['integer', 'real'].includes(c.type) && shownColumns?.includes(c.id)) || (['column0', 'column1'] as const).some((p) => params[p] === c.id)
	);
	const set = <T extends keyof CorrelationParams>(k: T, val: CorrelationParams[T]) => setParams({ [k]: val });

	const ColumnSelect = ({ k }: { k: keyof CorrelationParams }) => (
		<select
			className="Borderless"
			style={{ maxWidth: '10em', marginLeft: 4, padding: 0 }}
			value={params[k] as string}
			onChange={(e) => setParams({ [k]: e.target.value })}
		>
			{columnOpts.map(({ id, fullName }) => (
				<option key={id} value={id}>
					{fullName}
				</option>
			))}
		</select>
	);
	const Checkbox = ({ text, k }: { text: string; k: keyof CorrelationParams }) => (
		<label>
			{text}
			<input type="checkbox" style={{ paddingLeft: 4 }} checked={params[k] as boolean} onChange={(e) => setParams({ [k]: e.target.checked })} />
		</label>
	);

	return (
		<div className="Group">
			<div>
				<span className="TextButton" title="Reset" style={{ userSelect: 'none', cursor: 'pointer' }} onClick={() => set('sample0', '<current>')}>
					Sample:
				</span>
				<select
					title="Sample (none = all events)"
					className="Borderless"
					style={{ width: '10em', marginLeft: 4, color: params.sample0 === '<current>' ? color('text-dark') : 'unset' }}
					value={params.sample0}
					onChange={(e) => set('sample0', e.target.value)}
				>
					<option value="<none>">&lt;none&gt;</option>
					<option value="<current>">&lt;current&gt;</option>
					{samples.map(({ id, name }) => (
						<option key={id} value={id.toString()}>
							{name}
						</option>
					))}
				</select>
			</div>{' '}
			<div>
				X:
				<ColumnSelect k="column0" />
			</div>{' '}
			<div>
				Y:
				<ColumnSelect k="column1" />
			</div>
			<div style={{ textAlign: 'right' }}>
				<span
					className="TextButton"
					title="Reset"
					style={{ userSelect: 'none', cursor: 'pointer' }}
					onClick={() => setParams({ forceMin: null, forceMax: null })}
				>
					Limit X:
				</span>
				<NumberInput
					style={{ width: '4em', margin: '0 2px', padding: 0 }}
					value={params.forceMin}
					onChange={(val) => set('forceMin', val)}
					allowNull={true}
				/>
				;
				<NumberInput
					style={{ width: '4em', margin: '0 0 0 6px', padding: 0 }}
					value={params.forceMax}
					onChange={(val) => set('forceMax', val)}
					allowNull={true}
				/>
			</div>
			<div style={{ textAlign: 'right' }}>
				<span
					className="TextButton"
					title="Reset"
					style={{ userSelect: 'none', cursor: 'pointer' }}
					onClick={() => setParams({ forceMinY: null, forceMaxY: null })}
				>
					Limit Y:
				</span>
				<NumberInput
					style={{ width: '4em', margin: '0 2px', padding: 0 }}
					value={params.forceMinY}
					onChange={(val) => set('forceMinY', val)}
					allowNull={true}
				/>
				;
				<NumberInput
					style={{ width: '4em', margin: '0 0 0 6px', padding: 0 }}
					value={params.forceMaxY}
					onChange={(val) => set('forceMaxY', val)}
					allowNull={true}
				/>
			</div>
			<div className="Row">
				color:
				<select className="Borderless" style={{ padding: '0 6px' }} value={params.color} onChange={(e) => setParams({ color: e.target.value })}>
					{colors.map((c) => (
						<option key={c} value={c}>
							{c}
						</option>
					))}
				</select>
			</div>
			<div className="Row"></div>{' '}
			<div className="Row">
				<Checkbox text="regression" k="showRegression" />
				<Checkbox text="loglog" k="loglog" />
				<Checkbox text="logx" k="logx" />
			</div>
		</div>
	);
}

function Panel() {
	const { showGrid, showLegend, showTitle } = useEventsSettings();
	const { setCursor, setPlotId } = useEventsState();
	const { setParams } = useContext(LayoutContext)! as LayoutContextType<CorrelationParams>;
	const { data: shownData } = useContext(TableViewContext);
	const { data: allData, columns } = useTable();
	const { data: currentData, samples: samplesList } = useContext(SampleContext);
	const params = usePlotParams<CorrelationParams>();

	const overlayHandle = usePlotOverlay((u, { width }) => ({
		x: (u.bbox.left + u.bbox.width - scaled(width)) / scaled(1) + 6,
		y: 3,
	}));

	useEffect(() => {
		for (const k of ['column0', 'column1'] as (keyof CorrelationParams)[]) {
			if (params[k] == null) setParams({ [k]: findColumn(columns, k === 'column0' ? 'VmBm' : 'magnitude')?.id });
		}
	}, [params, columns]); // eslint-disable-line react-hooks/exhaustive-deps

	const memo = useMemo(() => {
		const { loglog, logx, showRegression, forceMax, forceMaxY, forceMin, forceMinY, sample0 } = params;

		const sampleData =
			sample0 === '<current>'
				? currentData
				: sample0 === '<none>'
				? allData
				: applySample(allData, samplesList.find((s) => s.id.toString() === sample0) ?? null, columns, samplesList);

		if (!sampleData.length) return null;
		const colIdx = ['column0', 'column1'].map((c) => columns.findIndex((cc) => cc.id === params[c as keyof CorrelationParams]));
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
		const regrPredicts = regrPoints.map((x) => (loglog ? Math.pow(Math.E, regr.predict(Math.log(x))[1]) : regr.predict(x)[1]));
		// const maxWidthY = loglog ? 3 : Math.max(...[miny, maxy].map(Math.abs).map(v => v.toFixed(0).length));

		const timeIdx = columns.findIndex((c) => c.fullName === 'time');
		const findRow = (i: number) => sampleData.find((row) => equalValues(row[colIdx[0]], data[i][0]) && equalValues(row[colIdx[1]], data[i][1]));

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
								setCursor({ row: shownData.findIndex((r) => r[0] === row[0]), column: 0, entity: 'feid', id: row[0] });
								setPlotId(() => row[0]);
							},
							html: (u, sidx, didx) => {
								const row = findRow(didx);
								return row ? `${prettyDate(row[timeIdx] as any)}; ${valueToString(row[colIdx[0]])}, ${valueToString(row[colIdx[1]])}` : '??';
							},
						}),
						titlePlugin({
							text: [
								{ text: `α=${intercept.toFixed(2)}; `, color: 'text-dark' },
								{ text: `β=${gradient.toFixed(3)} ± ${err.toFixed(3)}; r=${Math.sqrt(regr.r2).toFixed(2)}`, color: 'text' },
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
							fullLabel: colX.fullName,
							label: '',
							size: getFontSize() + scaled(12),
							incrs: [1, 2, 3, 4, 5, 10, 15, 20, 30, 50, 100, 200, 500],
							...(logx && minx > 10 && maxx - minx < 1000 && { filter: (u, splits) => splits }),
							values: (u, vals) =>
								vals.map((v) => (loglog && logx ? v?.toString().replace(/00+/, 'e' + v.toString().match(/00+/)?.[0].length) : v?.toString())),
						},
						{
							...axisDefaults(showGrid),
							fullLabel: colY.fullName,
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
								vals.map((v) => (loglog ? v?.toString().replace(/00+/, 'e' + v.toString().match(/00+/)?.[0].length) : v?.toString())),
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
									: samplesList.find((s) => s.id.toString() === sample0)?.name,
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
	}, [params, currentData, allData, samplesList, columns, showTitle, showLegend, overlayHandle, showGrid, setCursor, shownData, setPlotId]);

	if (!memo) return <div className="Center">NOT ENOUGH DATA</div>;
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
