import { useMemo } from 'react';
import { usePlot } from '../../events/core/plot';
import { useEventsSettings, valueToString } from '../../events/core/util';
import { prettyDate } from '../../util';
import { linePaths } from '../common/paths/linePaths';
import { pointPaths } from '../common/paths/pointPaths';
import { measureDigit, scaled, axisDefaults, getFontSize, color } from '../common/plotUtil';
import { legendPlugin, labelsPlugin } from '../common/plugins/plugins';
import { tooltipPlugin } from '../common/plugins/tooltipPlugin';
import { Quadtree } from '../common/quadtree';
import type { CustomAxis } from '../common/types';
import type { CorrelationParams, CorrelationSeries } from './Correlate';
import { useEventsState } from '../../events/core/eventsState';
import { useFeidTableView } from '../../events/core/feid';
import { useTable } from '../../events/core/editableTables';
import { usePlotOverlay } from '../common/plotOverlay';
import { ExportableUplot } from '../../events/export/ExportableUplot';

export default function CorrelationPlot({ series }: { series: CorrelationSeries[] }) {
	const { entry } = useTable('feid');
	const { data: shownData } = useFeidTableView();
	const { showGrid, showLegend } = useEventsSettings();
	const { setCursor, setPlotId } = useEventsState();
	const params = usePlot<CorrelationParams>();

	const overlayHandle = usePlotOverlay((u, { width }) => ({
		x: (u.bbox.left + u.bbox.width - scaled(width)) / scaled(1) + 6,
		y: 3,
	}));

	const memo = useMemo(() => {
		const { loglog, logx, showRegression, forceMax, forceMaxY, forceMin, forceMinY } = params;

		const pdata = series.map(({ X, Y, ids, predictions }) => {
			const data = [X.map((r) => r[0]), Y, ids, predictions];
			const idx = [...data[0].keys()].toSorted((a, b) => data[0][a] - data[0][b]);
			return data.map((col) => idx.map((i) => col[i]));
		});

		const regrData = pdata.map((d) => [d[0], d[3]]);

		console.log(regrData);

		// const maxWidthY = loglog ? 3 : Math.max(...[miny, maxy].map(Math.abs).map(v => v.toFixed(0).length));

		const minx = Math.min.apply(
			null,
			pdata.map((d) => d[0][0]),
		);
		const maxx = Math.max.apply(
			null,
			pdata.map((d) => d[d.length - 1][0]),
		);
		const miny = Math.min.apply(
			null,
			pdata.flatMap((d) => d[1]),
		);
		const maxy = Math.max.apply(
			null,
			pdata.flatMap((d) => d[1]),
		);

		const findRow = (si: number, i: number) => series[si].sampleData.find((row) => row[0] === pdata[si][3][i]);

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
							onclick: (u, sidx, didx) => {
								const row = findRow(sidx, didx);
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
								const row = entry(findRow(sidx, didx));
								if (!row) return '??';
								const vals = series[sidx].cols.map((c) => row[c.sql_name as keyof typeof row]);
								return `${prettyDate(row.time)}; ${vals.map(valueToString).join(', ')}`;
							},
						}),
						// titlePlugin({
						// 	text: [
						// 		{ text: `α=${intercept.toFixed(2)}; `, color: 'dark' },
						// 		{
						// 			text: `β=${gradient.toFixed(3)} ± ${err.toFixed(3)}; r=${Math.sqrt(regr.r2).toFixed(2)}`,
						// 			color: 'text',
						// 		},
						// 	],
						// 	params: { showTitle: showTitle && !!regr },
						// }),
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
							fullLabel: 'XXX',
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
							fullLabel: 'YYY',
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
						...series.map(({ sampleName, color: clr }) => ({
							facets: [
								{ scale: 'x', auto: true },
								{ scale: 'y', auto: true },
							],
							label: 'scatter',
							legend: sampleName,
							marker: 'circle',
							bars: true,
							stroke: color(clr),
							paths: pointPaths(scaled(4), (r: any) => qt.add(r)),
						})),
						...series.map(() => ({
							label: '',
							facets: [
								{ scale: 'x', auto: true },
								{ scale: 'y', auto: true },
							],
							show: showRegression,
							stroke: color('white'),
							paths: linePaths(scaled(1.5)),
						})),
					],
				} as Omit<uPlot.Options, 'width' | 'height'>;
			},
			data: [pdata[0], ...pdata, ...regrData] as any, // UplotReact seems to not be aware of faceted plot mode
		};
	}, [params, series, showLegend, overlayHandle, showGrid, setCursor, shownData, setPlotId, entry]);

	const { options, data } = memo;
	return <ExportableUplot {...{ options, data }} />;
}
