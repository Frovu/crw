import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import uPlot from 'uplot';
import { applyTextTransform } from '../common/basicPlot';
import { circlePaths } from '../common/paths/circlePaths';
import { axisDefaults, color, customTimeSplits, scaled, withCapturedOverrides } from '../common/plotUtil';
import { apiGet, prettyDate } from '../../util';

import type { RSMPlotResponse } from '../../api';
import type { ContextMenuProps } from '../../app/layout';
import { Button } from '../../components/Button';
import { TextInput } from '../../components/Input';
import { usePlot } from '../../events/core/plot';
import { ExportableUplot } from '../../events/export/ExportableUplot';
import { usePlotOverlay } from '../common/plotOverlay';
import { labelsPlugin, metainfoPlugin } from '../common/plugins/plugins';
import { Quadtree } from '../common/quadtree';
import { tooltipPlugin } from '../common/plugins/tooltipPlugin';
import { drawCirclesLegend, NEG_S, POS_S, renderCirclesData } from '../../crow/rsm/circlesPlot';
import { crowPlugin } from '../common/plugins/crowPlugin';

const defaultParams = {
	variationShift: 0,
	sizeShift: 0,
	linearSize: false,
};

export type CirclesPlotParams = typeof defaultParams;

function Menu({ params, Checkbox, set }: ContextMenuProps<CirclesPlotParams>) {
	return (
		<>
			<Checkbox k="linearSize" label="Linear size" />
			<div>
				<Button title="reset" onClick={() => set('variationShift', 0)}>
					Variation shift:
				</Button>
				<TextInput
					className="w-20 ml-1"
					type="number"
					min="-99"
					max="99"
					step=".05"
					value={params.variationShift?.toFixed(2) ?? ''}
					onChange={(e) => set('variationShift', isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)}
				/>
			</div>
			<div>
				<Button title="reset" onClick={() => set('sizeShift', 0)}>
					Size shift, px:
				</Button>
				<TextInput
					className="w-20 ml-1"
					type="number"
					min="-200"
					max="200"
					step="2"
					value={params.sizeShift?.toFixed(0) ?? ''}
					onChange={(e) => set('sizeShift', isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)}
				/>
			</div>
		</>
	);
}

function Panel() {
	const params = usePlot<CirclesPlotParams>();
	const { interval, fetchInterval, variationShift, showLegend } = params;

	const overlayHandle = usePlotOverlay((u, { width }) => ({
		x: (u.bbox.left + u.bbox.width - scaled(width)) / scaled(1) + 6,
		y: u.bbox.top / scaled(1),
	}));

	const query = useQuery({
		queryKey: ['plot', fetchInterval, 'rsm'],
		queryFn: () =>
			fetchInterval
				? apiGet<RSMPlotResponse>('crow/rsm/circles', {
						from: fetchInterval.start,
						to: fetchInterval.end,
					})
				: null,
	});

	const plotData = useMemo(() => {
		if (!query.data || !interval) return null;
		return renderCirclesData(query.data, interval, variationShift);
	}, [query.data, interval, variationShift]);

	const options: (() => Omit<uPlot.Options, 'width' | 'height'>) | null = useMemo(
		() => () => {
			let hoveredRect: any;
			let qt: Quadtree;
			return {
				padding: [scaled(8), scaled(54), 0, 0],
				mode: 2,
				legend: { show: false },
				cursor: {
					drag: { x: false, y: false, setScale: false },
					points: {
						size: (u, seriesIdx) => {
							return hoveredRect && seriesIdx === hoveredRect.sidx ? (hoveredRect.w + 1) / devicePixelRatio : 0;
						},
					},
					dataIdx: (u, seriesIdx) => {
						const cx = u.cursor.left! * devicePixelRatio;
						const cy = u.cursor.top! * devicePixelRatio;
						hoveredRect = null;
						qt.hover(cx, cy, (o: any) => {
							hoveredRect = o;
						});
						return hoveredRect && seriesIdx === hoveredRect.sidx ? hoveredRect.didx : null;
					},
				},
				plugins: [
					metainfoPlugin({ params }),
					tooltipPlugin({
						disableFocus: true,
						sidx: () => hoveredRect?.sidx,
						html: (u, sidx, didx) => {
							const time = (u.data as any)[sidx][0][didx];
							const alon = (u.data as any)[sidx][1][didx];
							const vari = (u.data as any)[sidx][2][didx];
							const staIdx = (u.data as any)[sidx][3][didx];
							const staName = query.data?.stations[staIdx].id;
							return `${prettyDate(time)}, ${alon.toFixed(1)}°<div class="text-white">${staName}: ${vari} %</div>`;
						},
					}),
					labelsPlugin({ params: { showLegend } }),
					crowPlugin(),
				],
				hooks: {
					draw: [drawCirclesLegend({ params, overlayHandle, plotData })],
					ready: [overlayHandle.onReady],
					drawClear: [
						(u) => {
							qt = new Quadtree(0, 0, u.bbox.width, u.bbox.height);
							qt.clear();
						},
					],
					drawAxes: [
						withCapturedOverrides((u) => {
							const bases = query.data?.bases ?? [];
							for (const base of bases) {
								u.ctx.save();
								u.ctx.fillStyle = u.ctx.strokeStyle = color('skyblue', 0.8);
								u.ctx.lineWidth = scaled(3 * devicePixelRatio);
								u.ctx.beginPath();
								const time = u.data[0][base];
								const x = Math.max(u.bbox.left, u.valToPos(time, 'x', true));
								const x2 = Math.max(u.bbox.left, u.valToPos(time + 86400, 'x', true));
								u.ctx.moveTo(x, u.bbox.top - scaled(3));
								u.ctx.lineTo(x2, u.bbox.top - scaled(3));
								u.ctx.stroke();
								u.ctx.restore();
							}
						}),
					],
				},
				axes: [
					{
						...axisDefaults(params.showGrid),
						...customTimeSplits(params),
					},
					{
						...axisDefaults(params.showGrid),
						ticks: { ...axisDefaults(params.showGrid).ticks, size: 4 },
						scale: 'y',
						label: applyTextTransform('eff. lon, deg'),
						values: (u, vals) => vals.map((v) => v.toFixed(0)),
						space: scaled(32),
						gap: scaled(2),
						incrs: [30, 45, 60, 90, 180, 360],
					},
					{
						scale: 'idx',
						show: false,
					},
				],
				scales: {
					x: {
						time: false,
						range: () => [params.interval!.start + 1800, params.interval!.end - 1800],
					},
					y: {
						range: [-5, 365],
					},
				},
				series: [
					{ facets: [{ scale: 'x', auto: true }] },
					{
						label: '+',
						facets: [
							{ scale: 'x', auto: true },
							{ scale: 'y', auto: true },
						],
						stroke: color('cyan'),
						fill: color('cyan2'),
						paths: circlePaths(POS_S, params, (r) => qt.add(r)),
					},
					{
						label: '-',
						facets: [
							{ scale: 'x', auto: true },
							{ scale: 'y', auto: true },
						],
						stroke: color('magenta'),
						fill: color('magenta2'),
						paths: circlePaths(NEG_S, params, (r) => qt.add(r)),
					},
				],
			};
		},
		[overlayHandle, params, plotData, query.data?.bases, query.data?.stations, showLegend],
	);

	if (query.isError) throw query.error;
	if (query.isLoading || !plotData) return <div className="center">LOADING...</div>;

	return (
		<div onDoubleClick={() => query.refetch()}>
			<ExportableUplot {...{ options, data: plotData as any }} />
		</div>
	);
}

export const RSMPlot = {
	name: 'Ring of Stations',
	Panel,
	Menu,
	defaultParams,
	isPlot: true,
};
