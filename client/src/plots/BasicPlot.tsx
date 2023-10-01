import { useState, useEffect, useMemo, MutableRefObject } from 'react';
import { useQuery } from 'react-query';
import UplotReact from 'uplot-react';
import { apiGet, clamp, useSize } from '../util';
import { BasicPlotParams, DefaultPosition, usePlotOverlayPosition, axisDefaults, customTimeSplits,
	markersPaths, drawMagneticClouds, drawOnsets, color, clickDownloadPlot, Position, Shape, Size, applyTextTransform, drawShape, font } from './plotUtil';
import uPlot from 'uplot';

export function drawCustomLegend(params: BasicPlotParams, position: MutableRefObject<Position|null>, size: MutableRefObject<Size>,
	defaultPos: (u: uPlot, csize: Size) => Position) {
	return (u: Omit<uPlot, 'series'> & { series: CustomSeries[] }) => {
		const series = u.series.filter(s => s.show! && s.legend)
			.map(s => ({ ...s, legend: applyTextTransform(params.transformText)(s.legend!) }));
		if (!series.length) return;

		const px = (a: number) => a * devicePixelRatio;
		u.ctx.font = font(16, true);
		const maxLabelLen = Math.max.apply(null, series.map(({ legend }) => legend.length));
		const metric = u.ctx.measureText('a'.repeat(maxLabelLen));
		const lineHeight = metric.fontBoundingBoxAscent + metric.fontBoundingBoxDescent + 1;
		const width = px(48) + metric.width;
		const height = series.length * lineHeight + 4;
		size.current = { width, height };

		const pos = position.current ?? defaultPos(u, size.current);

		const x = pos.x;
		let y = pos.y;
		u.ctx.save();
		u.ctx.lineWidth = px(2);
		u.ctx.strokeStyle = color('text-dark');
		u.ctx.fillStyle = color('bg');
		u.ctx.fillRect(x, y, width, height);
		u.ctx.strokeRect(x, y, width, height);
		u.ctx.textAlign = 'left';
		u.ctx.lineCap = 'butt';
		y += lineHeight / 2 + 3;
		const draw = drawShape(u.ctx, px(6));
		for (const { stroke, marker, legend } of series) {
			u.ctx.lineWidth = px(2);
			u.ctx.fillStyle = u.ctx.strokeStyle = (stroke as any)();
			u.ctx.beginPath();
			u.ctx.moveTo(x + px(8), y);
			u.ctx.lineTo(x + px(32), y);
			u.ctx.stroke();
			u.ctx.lineWidth = marker === 'arrow' ? px(2) : 1;
			if (marker)
				draw[marker](x + px(20), y);
			if (marker !== 'arrow')
				u.ctx.fill();
			u.ctx.fillStyle = color('text');
			u.ctx.fillText(legend, x + px(40), y);
			u.ctx.stroke();
			y += lineHeight;
		}
		u.ctx.restore();
	};
}

function drawCustomLabels(params: BasicPlotParams) {
	return (u: uPlot) => {
		for (const axis of (u.axes as CustomAxis[])) {
			if (!axis.show || !axis.fullLabel) continue;
			if (axis.side && axis.side % 2 === 0)
				return console.error('only implemented left or right axis');

			const rec = (txt: string=axis.fullLabel!): string[][] => {
				if (!txt) return [];
				const si = u.series.findIndex(s => txt.includes(s.label!));
				const series = si >= 0 && u.series[si];
				if (!series) return [[txt, color('text')]];
				const split = txt.split(series.label!);
				const stroke = typeof series.stroke === 'function' ? series.stroke(u, si) : series.stroke;
				return [...rec(split[0]), [series.label!, stroke as string], ...rec(split[1])];
			};

			const parts = !params.transformText ? rec() : rec().map(([text, stroke]) => {
				return [applyTextTransform(params.transformText)(text), stroke] as [string, string];
			});
			
			const flowDir = axis.side === 0 || axis.side === 3 ? 1 : -1;
			const baseX = (axis as any)._pos + (axis as any)._size * -flowDir;
			u.ctx.save();
			u.ctx.font = font(16, true);
			const textWidth = u.ctx.measureText(parts.reduce((a, b) => a + b[0], '')).width;
			const bottom = axis._splits?.[axis._values?.findIndex(v => !!v)!]!;
			const top = axis._splits?.[axis._values?.findLastIndex(v => !!v)!]!;
			const targetY = (axis.distr === 3 ? (u.bbox.top + u.bbox.height/2)
				 : u.valToPos((top + bottom) / 2, axis.scale!, true))
					+ flowDir * textWidth / 2;
			
			const px = (a: number) => a * devicePixelRatio;
			const bottomX = px(u.height);
			const posX = px(Math.round((baseX + axis.labelGap! * -flowDir)));
			const posY = flowDir > 0 ? clamp(textWidth + px(4), bottomX - px(2), targetY, true)
				: clamp(px(2), bottomX - textWidth - px(4), targetY);

			if (isNaN(posY))
				continue;
			u.ctx.translate(posX, posY);
			u.ctx.rotate((axis.side === 3 ? -Math.PI : Math.PI) / 2);
			u.ctx.textBaseline = 'bottom';
			u.ctx.textAlign = 'left';
			let x = 0;
			for (const [text, stroke] of parts) {
				u.ctx.fillStyle = stroke;
				u.ctx.fillText(text, x, 0);
				x += u.ctx.measureText(text).width;
			}
			u.ctx.restore();
		}
	};
}

export async function basicDataQuery(path: string, interval: [Date, Date], query: string[], params?: {}) {
	const body = await apiGet<{rows: (number | null)[][], fields: string[]}>(path, {
		from: (interval[0].getTime() / 1000).toFixed(0),
		to:   (interval[1].getTime() / 1000).toFixed(0),
		query: query.join(),
		...params
	});
	if (!body?.fields.length) return null;
	const fieldsIdxs = query.map(f => body.fields.indexOf(f));
	const ordered = fieldsIdxs.map(i => body.rows.map(row => row[i]));
	console.log(path, '=>', ordered, query);
	return ordered;
}

export type CustomAxis = uPlot.Axis & {
	label: string,
	fullLabel?: string,
	position?: [number, number],
	minMax?: [number|null, number|null],
	showGrid?: boolean,
	whole?: boolean,
	distr?: number,
	_values?: (string | undefined)[]
	_splits?: number[]
};
export type CustomSeries = uPlot.Series & {
	legend?: string,
	marker?: Shape,
};
export type CustomScale = uPlot.Scale & {
	scaleValue?: { min: number, max: number },
	positionValue?: { bottom: number, top: number },
};

export function BasicPlot({ queryKey, queryFn, options: userOptions, axes, series, params }:
{ queryKey: any[], queryFn: () => Promise<any[][] | null>, params: BasicPlotParams, options?: Partial<uPlot.Options>, axes: CustomAxis[], series: CustomSeries[] }) {
	const query = useQuery({
		queryKey,
		queryFn
	});

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	const defaultPos: DefaultPosition = (u, { width }) => ({
		x: u.bbox.left + u.bbox.width - width + 6, 
		y: u.bbox.top });
	const [legendPos, legendSize, handleDragLegend] = usePlotOverlayPosition(defaultPos);

	const [ uplot, setUplot ] = useState<uPlot>();
	useEffect(() => {
		if (!uplot) return;
		uplot.setSize({ ...size });
		for (const scl in uplot.scales) {
			const scale: CustomScale = uplot.scales[scl];
			if (scale.positionValue)
				params.scalesCallback?.(scl, { ...scale.scaleValue!, ...scale.positionValue! });
		}
	}, [params, uplot, size]);

	const plot = useMemo(() => {
		const options = {
			...size,
			pxAlign: true,
			padding: [8, 0, params.showTimeAxis ? 0 : 8, 0],
			legend: { show: params.interactive },
			cursor: {
				show: params.interactive,
				drag: { x: false, y: false, setScale: false }
			},
			scales: Object.fromEntries(axes?.map(ax => [ax.label, {
				distr: ax.distr ?? 1,
				...(ax.distr !== 3 && { range: (u, dmin, dmax) => {
					const override = params.overrideScales?.[ax.label];
					const [fmin, fmax] = ax.minMax ?? [null, null];
					const min = override?.min ?? Math.min(dmin, fmin ?? dmin) - .0001;
					const max = override?.max ?? Math.max(dmax, fmax ?? dmax) + .0001;
					const [ bottom, top ] = override ? [override.bottom, override.top] : ax.position ?? [0, 1];
					const scale: CustomScale = u.scales[ax.label];
					scale.scaleValue = { min, max };
					scale.positionValue = { bottom, top };
					const h = max - min;
					const resultingH = h / (top - bottom);
					const margin = h / 20;
					return [
						min - resultingH * bottom    - (!override && (dmin <= (fmin ?? dmin) && bottom === 0) ? margin : 0),
						max + resultingH * (1 - top) + (!override && (dmax >= (fmax ?? dmax) && top === 1) ? margin : 0)
					];
				} })
			} as uPlot.Scale]) ?? []),
			axes: [{
				...axisDefaults(params.showGrid),
				...customTimeSplits(params)
			}].concat((axes ?? []).map(ax => ({
				...axisDefaults(ax.showGrid ?? params.showGrid, ax.filter ?? ax.distr === 3 ? undefined : ((u, splits) => {
					const scale = u.scales[ax.scale ?? ax.label] as CustomScale;
					const { min, max } = scale.scaleValue!;
					return splits.map((s, i) => (s >= min || splits[i + 1] > min) && (s <= max || splits[i - 1] < max) ? s : null);
				})),
				values: (u, vals) => vals.map(v => v?.toString()),
				...(ax.whole && { incrs: [1, 2, 3, 4, 5, 10, 15, 20, 30, 50] }),
				scale: ax.label,
				...ax,
				label: '',
			}))),
			series: [{ }].concat((series ?? []).map(ser => ({
				points: !ser.marker ? { show: false } : {
					show: params.showMarkers,
					stroke: ser.stroke,
					fill: ser.fill ?? ser.stroke,
					width: 0,
					paths: markersPaths(ser.marker, 8)
				},
				scale: ser.label,
				...ser,
			}))),
			...userOptions
		} as uPlot.Options;
	
		options.hooks = {
			...options.hooks,
			drawAxes: options.hooks?.drawAxes ?? (params.showMetaInfo ? [
				u => drawMagneticClouds(u, params),
			] : []),
			draw: [
				drawCustomLabels(params),
				...(params.showMetaInfo && !options.hooks?.drawAxes ? [(u: uPlot) => drawOnsets(u, params)] : []),
				...(params.showLegend ? [drawCustomLegend(params, legendPos, legendSize, defaultPos)] : []),
				...(options.hooks?.draw ?? [])
			],
			ready: [
				handleDragLegend
			].concat(options.hooks?.ready ?? [] as any)
		};
		return <UplotReact {...{ options, data: query.data as any, onCreate: setUplot }}/>;
	}, [params, query.data]); // eslint-disable-line
	
	if (query.isLoading)
		return <div className='Center'>LOADING...</div>;
	if (query.isError)
		return <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>;
	if (!query.data?.[0].length)
		return <div className='Center'>NO DATA</div>;

	return (<div ref={node => setContainer(node)} style={{ position: 'absolute' }} onClick={clickDownloadPlot}>
		{plot}
	</div>);

}