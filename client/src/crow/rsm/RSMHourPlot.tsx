import { useMemo } from 'react';
import { apiGet } from '../../util';
import { linePaths } from '../../plots/common/paths/linePaths';
import { axisDefaults, color, scaled } from '../../plots/common/plotUtil';
import { useQuery } from '@tanstack/react-query';
import uPlot from 'uplot';

import { ExportableUplot } from '../../events/export/ExportableUplot';
import type { ContextMenuProps } from '../../app/layout';
import { usePlot } from '../../events/core/plot';
import type { RSMPlotResponse } from '../../api';
import { useCrowState } from '../core/crowState';
import { pointPaths } from '../../plots/common/paths/pointPaths';
import { NumberInput } from '../../components/Input';

const defaultParams = {
	window: 3,
};

export type RSMHourParams = typeof defaultParams;

function renderRSMHourData(data: RSMPlotResponse, hour: number, params: RSMHourParams) {
	const idx = data.time.indexOf(hour);
	if (idx < params.window - 1 || !data.model) return null;

	const drifts = data.stations.map((s) => s.drift_longitude);
	const window = [...Array(params.window).keys()];
	const x = window.flatMap((wi) => drifts.map((drift) => (drift + (data.time[idx - wi] * 360) / 86400) % 360));
	const y = window.flatMap((wi) => data.variations.map((vars) => vars[idx - wi]));

	const indices = [...x.keys()].filter((i) => y[i] != null);
	indices.sort((a, b) => x[a] - x[b]);

	const pointsX = indices.map((i) => x[i]);
	const pointsY = indices.map((i) => y[i]);

	const modelX = [...Array(360).keys()];
	const modelY = data.model[idx] ?? [...Array(360).map(() => null)];
	return [data.time, [pointsX, pointsY], [modelX, modelY]];
}

function Menu({ params, set }: ContextMenuProps<RSMHourParams>) {
	return (
		<>
			<div>
				Window:
				<NumberInput
					type="number"
					className="w-12"
					min={1}
					max={24}
					value={params.window}
					onChange={(val) => set('window', val)}
					allowNull={false}
				/>
			</div>
		</>
	);
}

function Panel() {
	const params = usePlot<RSMHourParams>();
	const { cursor } = useCrowState();
	const { fetchInterval, window } = params;

	const query = useQuery({
		queryKey: [fetchInterval, 'rsmModel', window],
		queryFn: () =>
			fetchInterval
				? apiGet<RSMPlotResponse>('crow/rsm/all', {
						from: fetchInterval.start,
						to: fetchInterval.end,
						window,
					})
				: null,
	});

	const [min, max] = useMemo(() => {
		if (!query.data) return [0, 0];
		const allVars = query.data.variations.flat().filter((v) => v != null);
		return [Math.min(...allVars), Math.max(...allVars)];
	}, [query.data]);

	const plotData = useMemo(() => {
		if (!query.data || !cursor) return null;
		return renderRSMHourData(query.data, cursor?.time, params);
	}, [cursor, params, query.data]);

	const options: (() => Omit<uPlot.Options, 'width' | 'height'>) | null = useMemo(() => {
		return () => ({
			mode: 2,
			padding: [scaled(10), 0, 0, 0],
			legend: { show: false, live: false },
			cursor: {
				show: false,
				drag: { x: false, y: false },
			},
			hooks: {},
			axes: [
				{
					...axisDefaults(true),
					size: scaled(36),
					space: scaled(36),
					values: (u, vals) => vals.map((v) => v.toFixed(0)),
					incrs: Array(360 / 45)
						.fill(1)
						.map((a, i) => i * 45),
				},
				{
					...axisDefaults(true),
					size: scaled(54),
					space: scaled(36),
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
					range: (u, dmin) => [min < -5 && dmin > -2 ? -2 : min, max],
				},
			},
			series: [
				{},
				{
					stroke: color('magenta'),
					paths: pointPaths(scaled(10)),
				},
				// {
				// 	stroke: color('purple'),
				// 	paths: linePaths(2),
				// },
				{
					stroke: color('green'),
					paths: linePaths(scaled(2)),
				},
			],
		});
	}, [min, max]);

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
