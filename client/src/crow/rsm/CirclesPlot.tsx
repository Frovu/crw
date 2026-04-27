import { useMemo, useState } from 'react';
import { apiGet } from '../../util';
import { circlePaths } from '../../plots/common/paths/circlePaths';
import { axisDefaults, color, customTimeSplits, scaled } from '../../plots/common/plotUtil';
import { drawMagneticClouds } from '../../plots/common/draw/drawMagneticClouds';
import { drawOnsets } from '../../plots/common/draw/drawOnsets';
import { applyTextTransform } from '../../plots/common/basicPlot';
import { useQuery } from '@tanstack/react-query';
import uPlot from 'uplot';

import { ExportableUplot } from '../../events/export/ExportableUplot';
import type { ContextMenuProps } from '../../app/layout';
import { usePlot } from '../../events/core/plot';
import type { RSMPlotResponse } from '../../api';
import { drawCirclesLegend, NEG_S, POS_S, renderCirclesData } from './circlesPlot';
import { usePlotOverlay } from '../../plots/common/plotOverlay';

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
	const { interval, variationShift } = params;

	const overlayHandle = usePlotOverlay((u, { width }) => ({
		x: (u.bbox.left + u.bbox.width - scaled(width)) / scaled(1) + 6,
		y: u.bbox.top / scaled(1),
	}));

	const query = useQuery({
		queryKey: ['rsm', interval],
		queryFn: () =>
			apiGet<RSMPlotResponse>('crow/rsm/circles', {
				from: interval[0].getTime() / 1e3,
				to: interval[1].getTime() / 1e3,
			}),
	});

	const [uplot, setUplot] = useState<uPlot>();
	const plotData = useMemo(() => {
		if (!query.data) return null;
		return renderCirclesData(query.data, variationShift);
	}, [query.data, variationShift]);

	const options: (() => Omit<uPlot.Options, 'width' | 'height'>) | null = useMemo(() => {
		return () => ({
			padding: [scaled(8), scaled(52), 0, 0],
			mode: 2,
			legend: { show: false },
			cursor: {
				show: false,
			},
			hooks: {
				draw: [drawMagneticClouds(params), drawOnsets(params), drawCirclesLegend({ params, overlayHandle, plotData })],
				ready: [overlayHandle.onReady],
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
					paths: circlePaths(null, POS_S, params),
				},
				{
					label: '-',
					facets: [
						{ scale: 'x', auto: true },
						{ scale: 'y', auto: true },
					],
					stroke: color('magenta'),
					fill: color('magenta2'),
					paths: circlePaths(null, NEG_S, params),
				},
			],
		});
	}, [params, plotData]);

	if (query.isError) throw query.error;
	if (query.isLoading || !plotData) return <div className="center">LOADING...</div>;

	return <ExportableUplot {...{ options, data: plotData as any, onCreate: setUplot }} />;
}

export const RSMPlot = {
	name: 'Ring of Stations 2',
	Panel,
	Menu,
	defaultParams,
	isPlot: true,
};
