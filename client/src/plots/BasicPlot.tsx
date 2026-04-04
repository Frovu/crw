import { useCallback, useContext, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
	usePlotOverlay,
	axisDefaults,
	customTimeSplits,
	markersPaths,
	color,
	type Size,
	scaled,
	getParam,
	getFontSize,
} from './plotUtil';
import uPlot from 'uplot';
import { ExportableUplot } from '../events/export/ExportableUplot';
import {
	type BasicPlotParams,
	type CustomAxis,
	type CustomSeries,
	type CustomScale,
	tooltipPlugin,
	metainfoPlugin,
	legendPlugin,
	labelsPlugin,
	paddedInterval,
	sliceData,
	actionsPlugin,
} from './basicPlot';
import { useSunViewState } from '../events/panels/SDO';
import { LayoutContext } from '../app/layout';

const calcSize = (panel: Size) => ({ width: panel.width - 2, height: panel.height - 2 });

export default function BasicPlot({
	queryKey,
	queryFn,
	options: userOptions,
	axes: getAxes,
	series: getSeries,
	params,
	metaParams,
	tooltipParams,
}: {
	queryKey: (interval: [number, number]) => any[];
	queryFn: (interval: [number, number]) => Promise<any[][] | null>;
	params: BasicPlotParams;
	metaParams?: Partial<Parameters<typeof metainfoPlugin>[0]>;
	tooltipParams?: Partial<Parameters<typeof tooltipPlugin>[0]>;
	options?: () => Partial<uPlot.Options>;
	axes: () => CustomAxis[];
	series: () => CustomSeries[];
}) {
	const [upl, setUpl] = useState<uPlot | null>(null);
	const layoutContext = useContext(LayoutContext);

	const query = useQuery({
		queryKey: queryKey(paddedInterval(params.interval)),
		queryFn: () => queryFn(paddedInterval(params.interval)),
		retry: 1,
	});

	const overlayHandle = usePlotOverlay((u, { width }) => ({
		x: (u.bbox.left + u.bbox.width - scaled(width)) / scaled(1) + 6,
		y: u.bbox.top / scaled(1),
	}));

	const options = useCallback(() => {
		const axes = getAxes(),
			series = getSeries();
		const axSize = (axisDefaults(false).size as number) + axisDefaults(false).labelSize!;
		const padRight = axes.find((ax) => ax.show === false && ax.side === 1) ? axSize : 0;
		const scaleOverrides = getParam('scalesParams');
		const uopts = userOptions?.();
		return {
			pxAlign: true,
			padding: [getFontSize() / 2, padRight, params.showTimeAxis ? 0 : getFontSize() / 2 - scaled(2), 0],
			legend: { show: params.interactive },
			focus: { alpha: 0.6 },
			...uopts,
			scales: Object.fromEntries(
				axes?.map((ax) => [
					ax.label,
					{
						distr: ax.distr ?? 1,
						range: (u, dmin, dmax) => {
							const override = scaleOverrides?.[ax.label];
							const [fmin, fmax] = ax.minMax ?? [null, null];
							const pmin = override?.min ?? Math.min(dmin, fmin ?? dmin);
							const min = ax.distr !== 3 ? pmin : Math.max(1e-10, pmin);
							const max = override?.max ?? Math.max(dmax, fmax ?? dmax, min + 0.001);
							const [bottom, top] =
								override && ax.distr !== 3 ? [override.bottom, override.top] : (ax.position ?? [0, 1]);
							const scale: CustomScale = u.scales[ax.label];
							scale.scaleValue = { min, max };
							scale.positionValue = { bottom, top };
							const h = max - min;
							const resultingH = h / (top - bottom);
							const margin = ax.distr !== 3 ? h / 20 : 0;
							return [
								min - resultingH * bottom - (!override && dmin <= (fmin ?? dmin) && bottom === 0 ? margin : 0),
								max + resultingH * (1 - top) + (!override && dmax >= (fmax ?? dmax) && top === 1 ? margin : 0),
							];
						},
					} as uPlot.Scale,
				]) ?? [],
			),
			axes: [
				{
					...axisDefaults(params.showGrid),
					...customTimeSplits(params),
				},
			].concat(
				(axes ?? []).map((ax) => ({
					...axisDefaults(
						ax.showGrid ?? params.showGrid,
						(ax.filter ?? ax.distr === 3)
							? undefined
							: (u, splits) => {
									const scale = u.scales[ax.scale ?? ax.label] as CustomScale;
									const { min, max } = scale.scaleValue!;
									return splits.map((s, i) =>
										(s >= min || splits[i + 1] > min) && (s <= max || splits[i - 1] < max) ? s : null,
									);
								},
					),
					values: (u, vals) => vals.map((v) => v?.toString().replace('-', '−').replace('0.', '.')),
					// ...(ax.distr === 3 && {
					// 	incrs: [1e-4, 1e-3, 1e-2, 0.1, 1, 10, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10],
					// }),
					...(ax.whole && {
						incrs: [1, 2, 3, 4, 5, 10, 15, 20, 30, 50, 100, 1e3],
					}),
					scale: ax.label,
					...ax,
					label: '',
				})),
			),
			series: [{}].concat(
				(series ?? []).map((ser) => ({
					points: !ser.marker
						? { show: false }
						: {
								show: params.showMarkers,
								stroke: ser.stroke,
								fill: ser.fill ?? ser.stroke,
								width: 0,
								paths: markersPaths(ser.marker, 8),
							},
					scale: ser.label,
					...ser,
					paths: ser.myPaths?.(scaled(1)),
					width: scaled(ser.width ?? 1),
				})),
			),
			plugins: [
				metainfoPlugin({ params, ...metaParams }),
				legendPlugin({ params, overlayHandle }),
				labelsPlugin({ params }),
				tooltipPlugin({ ...tooltipParams }),
				actionsPlugin(),
				...(uopts?.plugins ?? []),
			],
		} as uPlot.Options;
	}, [params, query.data]); // eslint-disable-line

	const data = useMemo(() => {
		if (!query.data) return null;
		return sliceData(query.data, params.interval);
	}, [query.data, params.interval]);

	if (query.isLoading) return <div className="center">LOADING...</div>;
	if (query.isError) throw query.error;
	if (!query.data?.[0]?.length) return <div className="center">NO DATA</div>;

	return (
		<div className="absolute">
			<ExportableUplot {...{ size: calcSize, options, data: data!, onCreate: setUpl }} />
			{(layoutContext?.panel as any)?.isSolar && upl && <SolarPlotOverlay upl={upl} />}
		</div>
	);
}

export function SolarPlotOverlay({ upl }: { upl: uPlot }) {
	const { time } = useSunViewState();

	const x = upl.valToPos(time, 'x', true);
	const out = isNaN(x) || x < upl.bbox.left || x > upl.bbox.left + upl.bbox.width;

	return out ? null : <div className="absolute top-0 h-full w-[2px] bg-text/50" style={{ left: x }} />;
}
