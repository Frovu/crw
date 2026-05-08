import { useMemo } from 'react';
import { apiGet } from '../../util';
import { linePaths } from '../../plots/common/paths/linePaths';
import { axisDefaults, color } from '../../plots/common/plotUtil';
import { useQuery } from '@tanstack/react-query';
import uPlot from 'uplot';

import { ExportableUplot } from '../../events/export/ExportableUplot';
import type { ContextMenuProps } from '../../app/layout';
import { usePlot } from '../../events/core/plot';
import type { RSMPlotResponse } from '../../api';
import { useCrowState } from '../core/crowState';
import { pointPaths } from '../../plots/common/paths/pointPaths';

const defaultParams = {
	window: 3,
};

export type RSMHourParams = typeof defaultParams;

function renderRSMHourData(data: RSMPlotResponse, hour: number, params: RSMHourParams) {
	const idx = data.time.indexOf(hour);
	console.log(idx, data.model);
	if (idx < params.window - 1 || !data.model) return null;

	const drifts = data.stations.map((s) => s.drift_longitude);
	const window = [...Array(params.window).keys()];
	const x = window.flatMap((wi) => drifts.map((drift) => (drift + (data.time[idx - wi] * 360) / 86400) % 360));
	const y = window.flatMap((wi) => data.variations.map((vars) => vars[idx - wi]));

	const indices = [...x.keys()];
	indices.sort((a, b) => x[a] - x[b]);

	const pointsX = indices.map((i) => x[i]);
	const pointsY = indices.map((i) => y[i]);

	const modelX = [...Array(360).keys()];
	const modelY = data.model[idx] ?? [...Array(360).map(() => null)];
	console.log(modelX, modelY);
	return [data.time, [pointsX, pointsY], [modelX, modelY]];
}

function Menu({ params, Checkbox, setParams }: ContextMenuProps<RSMHourParams>) {
	return <></>;
}

function Panel() {
	const params = usePlot<RSMHourParams>();
	const { cursor } = useCrowState();
	const { fetchInterval } = params;

	const query = useQuery({
		queryKey: [fetchInterval, 'rsmModel'],
		queryFn: () =>
			fetchInterval
				? apiGet<RSMPlotResponse>('crow/rsm/all', {
						from: fetchInterval.start,
						to: fetchInterval.end,
					})
				: null,
	});

	const plotData = useMemo(() => {
		if (!query.data || !cursor) return null;
		return renderRSMHourData(query.data, cursor?.time, params);
	}, [cursor, params, query.data]);

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
					range: (u, min, max) => [min, max],
				},
			},
			series: [
				{},
				{
					stroke: color('magenta'),
					paths: pointPaths(10),
				},
				// {
				// 	stroke: color('purple'),
				// 	paths: linePaths(2),
				// },
				{
					stroke: color('green'),
					paths: linePaths(2),
				},
			],
		});
	}, []);

	if (query.isError) throw query.error;
	if (query.isLoading) return <div className="center">LOADING...</div>;
	if (!plotData) return <div className="center">NO DATA</div>;

	return <ExportableUplot {...{ options, data: plotData as any }} />;
}

export const RSMHourPlot = {
	name: 'RSM Hour View',
	Panel,
	Menu,
	defaultParams,
	isPlot: true,
};
