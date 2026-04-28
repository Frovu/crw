import { useMemo } from 'react';
import { apiGet, prettyDate } from '../../util';
import { circlePaths } from '../../plots/common/paths/circlePaths';
import { axisDefaults, color, customTimeSplits, scaled } from '../../plots/common/plotUtil';
import { applyTextTransform } from '../../plots/common/basicPlot';
import { useQuery } from '@tanstack/react-query';
import uPlot from 'uplot';

import { ExportableUplot } from '../../events/export/ExportableUplot';
import type { ContextMenuProps } from '../../app/layout';
import { usePlot } from '../../events/core/plot';
import type { RSMPlotResponse } from '../../api';
import { drawCirclesLegend, NEG_S, POS_S, renderCirclesData } from './circlesPlot';
import { usePlotOverlay } from '../../plots/common/plotOverlay';
import { labelsPlugin, metainfoPlugin, tooltipPlugin } from '../../plots/common/plugins';
import { Quadtree } from '../../plots/common/quadtree';

const defaultParams = {
	variationShift: 0,
	sizeShift: 0,
	linearSize: false,
};

export type CirclesPlotParams = typeof defaultParams;

function Menu({ params, Checkbox, setParams }: ContextMenuProps<CirclesPlotParams>) {
	return <></>;
}

function Panel() {
	const params = usePlot<CirclesPlotParams>();
	const { interval, fetchInterval, variationShift, showLegend } = params;

	const overlayHandle = usePlotOverlay((u, { width }) => ({
		x: (u.bbox.left + u.bbox.width - scaled(width)) / scaled(1) + 6,
		y: u.bbox.top / scaled(1),
	}));

	const query = useQuery({
		queryKey: ['rsm', fetchInterval],
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

	const options: (() => Omit<uPlot.Options, 'width' | 'height'>) | null = useMemo(() => {
		let hoveredRect: any;
		let qt: Quadtree;
		return () => ({
			padding: [scaled(8), scaled(48), 0, 0],
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
					return hoveredRect && seriesIdx === hoveredRect.sidx ? hoveredRect.didx : -1;
				},
			},
			plugins: [
				metainfoPlugin({ params }),
				tooltipPlugin({
					disableFocus: true,
					sidx: () => hoveredRect?.sidx,
					didx: () => hoveredRect?.didx,
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
			],
			hooks: {
				draw: [drawCirclesLegend({ params, overlayHandle, plotData })],
				ready: [overlayHandle.onReady],
				drawClear: [
					(u) => {
						// eslint-disable-next-line react-hooks/immutability
						qt = new Quadtree(0, 0, u.bbox.width, u.bbox.height);
						qt.clear();
					},
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
					label: applyTextTransform('eff lon, deg'),
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
					range: (u, min, max) => [min, max],
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
		});
	}, [params, plotData]);

	if (query.isError) throw query.error;
	if (query.isLoading || !plotData) return <div className="center">LOADING...</div>;

	return <ExportableUplot {...{ options, data: plotData as any }} />;
}

export const RSMPlot = {
	name: 'Ring of Stations 2',
	Panel,
	Menu,
	defaultParams,
	isPlot: true,
};
