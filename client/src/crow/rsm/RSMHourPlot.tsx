import { useMemo, useRef, useState } from 'react';
import { apiGet, useSize } from '../../util';
import { circlePaths, linePaths } from '../../plots/common/plotPaths';
import {
	axisDefaults,
	color,
	customTimeSplits,
	drawMagneticClouds,
	drawOnsets,
	scaled,
	usePlotOverlay,
} from '../../plots/common/plotUtil';
import { applyTextTransform } from '../../plots/common/basicPlot';
import { useQuery } from '@tanstack/react-query';
import uPlot from 'uplot';

import { ExportableUplot } from '../../events/export/ExportableUplot';
import type { ContextMenuProps } from '../../app/layout';
import { usePlot } from '../../events/core/plot';
import type { RSMPlotResponse } from '../../api';
import { drawCirclesLegend, NEG_S, POS_S, renderCirclesData } from './circlesPlot';

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
			mode: 2,
			padding: [0, 0, 0, 0],
			legend: { show: false, live: false },
			cursor: {
				show: false,
				drag: { x: false, y: false },
			},
			hooks: {},
			axes: [
				{
					...axisDefaults(true),
					size: 36,
					space: 36,
					values: (u, vals) => vals.map((v) => v.toFixed(0)),
					incrs: Array(360 / 45)
						.fill(1)
						.map((a, i) => i * 45),
				},
				{
					...axisDefaults(true),
					size: 54,
					space: 36,
					scale: 'y',
					values: (u, vals) => vals.map((v) => v.toFixed(1)),
				},
			],
			scales: {
				x: {
					time: false,
					range: [0, 365],
				},
				y: {
					range: (u, min, max) => (scaleRange as any) || [min, max],
				},
			},
			series: [
				{},
				{
					stroke: color('magenta'),
					paths: pointPaths(10),
				},
				{
					stroke: color('purple'),
					paths: linePaths(2),
				},
				{
					stroke: color('green'),
					paths: linePaths(2),
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
