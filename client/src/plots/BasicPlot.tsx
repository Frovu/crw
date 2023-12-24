import { type MutableRefObject, useCallback } from 'react';
import { useQuery } from 'react-query';
import { apiGet, clamp } from '../util';
import { type DefaultPosition, usePlotOverlayPosition, axisDefaults, customTimeSplits, applyOverrides, withOverrides,
	markersPaths, drawMagneticClouds, drawOnsets, color, type Position, type Shape, type Size,
	drawShape, font, scaled, measureDigit, getParam, getFontSize } from './plotUtil';
import uPlot from 'uplot';
import { ExportableUplot } from '../events/ExportPlot';
import type { Onset, MagneticCloud } from '../events/events';

export type TextTransform = {
	search: string,
	replace: string,
};
export type ScaleParams = {
	min: number, max: number, bottom: number, top: number
};
export type BasicPlotParams = {
	interval: [Date, Date],
	onsets?: Onset[],
	clouds?: MagneticCloud[],
	interactive?: boolean,
	stretch?: boolean,
	showTimeAxis: boolean,
	showMetaLabels: boolean,
	showMetaInfo: boolean,
	showGrid: boolean,
	showMarkers: boolean,
	showLegend: boolean
};

export const applyTextTransform = (text: string) => {
	return getParam('textTransform')?.reduce((txt, { search, replace }) => {
		try { return txt.replace(new RegExp(search, 'ug'), replace); }
		catch(e) { return txt; }
	}, text) ?? text;
};

const styleTags = { b: 'bold', i: 'italic', sup: 'super', sub: 'sub' } as const;
type TextNode = {
	text: string,
	styles: (typeof styleTags[keyof typeof styleTags])[],
};
export const parseText = (txt: string) => {
	const style = (a: keyof typeof styleTags) => (styleTags[a]);
	const split = (t: string, spl: string) => t.split(new RegExp(`${spl}(.*)`)).concat('').slice(0, 2);
	const rec = (node: TextNode): TextNode[] => {
		const { text, styles } = node;
		if (!text)
			return [];
		const tagName = text.match(`<(${Object.keys(styleTags).join('|')})>`)?.[1] as keyof typeof styleTags;
		if (!tagName)
			return [node];
		const tag = `<${tagName}>`, closing = `</${tagName}>`;
		const [before, after] = split(text, tag);
		const [inside, outside] = split(after, closing);
		return [
			...rec({ text: before, styles }),
			...rec({ text: inside, styles: styles.concat(style(tagName)) }),
			...rec({ text: outside, styles }),
		];
		
	};
	return rec({ text: txt, styles: [] });
};

export const applyStyles = (ctx: CanvasRenderingContext2D, styles: TextNode['styles']) => {
	const style = (styles.includes('italic') ? 'italic' : '') + (styles.includes('bold') ? ' bold' : '');
	const fSize = getParam('fontSize');
	const size = (styles.includes('super') || styles.includes('sub')) ? Math.ceil(fSize * 3 / 4) : null;
	ctx.font = font(size, true, style);
	if (styles.includes('sub'))
		ctx.translate(0, scaled(fSize / 8));
	if (styles.includes('super'))
		ctx.translate(0, -scaled(fSize / 3));
};

export const measureStyled = (ctx: CanvasRenderingContext2D, parts: TextNode[]) => {
	const textWidth = parts.reduce((a, { text, styles }) => {
		ctx.save();
		applyStyles(ctx, styles);
		const ww = ctx.measureText(text).width + ctx.getTransform().e;
		ctx.restore();
		return a + ww;
	}, 0);
	return textWidth;
};

export function drawCustomLegend(params: { showLegend: boolean }, position: MutableRefObject<Position|null>, size: MutableRefObject<Size>,
	defaultPos: (u: uPlot, csize: Size) => Position) {
	const captureOverrides = applyOverrides;
	return (u: Omit<uPlot, 'series'> & { series: CustomSeries[] }) => withOverrides(() => {
		if (!params.showLegend) return;
		const series = u.series.filter(s => s.show! && s.legend)
			.map(s => ({ ...s, legend: parseText(applyTextTransform(' '+s.legend!).trim()) }));
		if (!series.length) return;

		const allBars = series.every(s => s.bars);

		const px = (a: number) => scaled(a * devicePixelRatio);

		const makrerWidth = allBars ? 12 : 24;
		const width = px(makrerWidth + 16) + Math.max.apply(null, series.map(({ legend }) => measureStyled(u.ctx, legend)));
		const lineHeight = getFontSize() * 1.2;
		const height = series.length * lineHeight + px(4);
		if (!captureOverrides?.scale)
			size.current = { width, height };

		const pos = position.current ?? defaultPos(u, size.current);

		const x = scaled(pos.x);
		let y = scaled(pos.y);
		u.ctx.save();
		u.ctx.lineWidth = px(1);
		u.ctx.strokeStyle = color('text-dark');
		u.ctx.fillStyle = color('bg');
		u.ctx.fillRect(x, y, width, height);
		u.ctx.strokeRect(x, y, width, height);
		u.ctx.textAlign = 'left';
		u.ctx.lineCap = 'butt';
		y += lineHeight / 2 + px(3);
		const draw = drawShape(u.ctx, px(6));
		for (const { stroke, marker, legend, bars } of series) {
			u.ctx.lineWidth = px(2);
			u.ctx.fillStyle = u.ctx.strokeStyle = (stroke as any)();
			u.ctx.beginPath();
			if (!bars) {
				u.ctx.moveTo(x + px(6), y);
				u.ctx.lineTo(x + px(6 + makrerWidth), y);
				u.ctx.stroke();
			}
			u.ctx.lineWidth = marker === 'arrow' ? px(2) : px(1);
			const mrkr = bars ? 'square' : marker;
			if (mrkr)
				draw[mrkr](x + px(6 + makrerWidth / 2), y);
			if (mrkr !== 'arrow')
				u.ctx.fill();
			u.ctx.fillStyle = color('text');
			let textX = x + px(makrerWidth + 12);
			for (const { text, styles } of legend) {
				u.ctx.save();
				applyStyles(u.ctx, styles);
				u.ctx.fillText(text, textX, y);
				textX += u.ctx.measureText(text).width;
				u.ctx.restore();
			}
			u.ctx.stroke();
			y += lineHeight;
		}
		u.ctx.restore();
	}, captureOverrides);
}

export function drawCustomLabels() {
	const captureOverrides = applyOverrides;
	return (u: uPlot) => withOverrides(() => {
		for (const axis of (u.axes as CustomAxis[])) {
			if (!axis.show || !axis.fullLabel) continue;

			const isHorizontal = axis.side && axis.side % 2 === 0;

			const marked: {[k: string]: true} = {};
			const rec = (txt: string=axis.fullLabel!): string[][] => {
				if (!txt) return [];
				const re = (label: string) => new RegExp(`(?<!(?:d|e)\\()${label.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&')}(?![_a-z])`);
				const series = u.series.find(ser => !marked[ser.label!] && txt.match(re(ser.label!)));
				if (!series) return [[txt, color('text')]];
				marked[series.label!] = true;
				const split = txt.slice().split(re(series.label!));
				const stroke = typeof series.stroke === 'function' ? series.stroke(u, 0) : series.stroke; // FIXME: seriesIdx
				return [...rec(split[0]), [series.label!, stroke as string], ...rec(split[1])];
			};

			const parts = rec().flatMap(([text, stroke]) => {
				const nodes = parseText(applyTextTransform(text));
				return nodes.map(n => ({ ...n, stroke }));
			});

			const fontSize = measureDigit();
			const textWidth = measureStyled(u.ctx, parts);
			const px = (a: number) => scaled(a * devicePixelRatio);
			
			const flowDir = isHorizontal || axis.side === 3 ? 1 : -1;
			const baseTop = (flowDir > 0 ? 0 : u.width) + (axis.labelSize ?? fontSize.height) * flowDir;
			const first = axis._splits?.[axis._values?.findIndex(v => !!v)!]!;
			const last = axis._splits?.[axis._values?.findLastIndex(v => !!v)!]!;
			const targetLeft = (axis.distr === 3 ? (u.bbox.top + u.bbox.height/2)
				 : u.valToPos((last + first) / 2, axis.scale!, true))
					+ flowDir * textWidth / 2;
			
			let posX, posY;
			if (isHorizontal) {
				posX = clamp(px(2), u.width - textWidth - px(4), targetLeft - textWidth);
				posY = axis.side === 0 ? (axis.labelSize ?? fontSize.height) : u.height;
			} else {
				const bottomX = u.height * devicePixelRatio;
				posX = Math.round(baseTop + axis.labelGap! * -flowDir) * devicePixelRatio;
				posY = flowDir > 0 ? clamp(textWidth + px(4), bottomX - px(2), targetLeft, true)
					: clamp(px(2), bottomX - textWidth - px(4), targetLeft);
				if (isNaN(posY))
					continue;

			}
			
			u.ctx.save();
			u.ctx.translate(posX, posY);
			if (!isHorizontal)
				u.ctx.rotate((axis.side === 3 ? -Math.PI : Math.PI) / 2);
			u.ctx.textBaseline = 'bottom';
			u.ctx.textAlign = 'left';
			let x = 0;
			for (const { text, stroke, styles } of parts) {
				u.ctx.save();
				applyStyles(u.ctx, styles);
				u.ctx.fillStyle = stroke;
				u.ctx.fillText(text, x, 0);
				x += u.ctx.measureText(text).width;
				u.ctx.restore();
			}
			u.ctx.restore();
		}
	}, captureOverrides);
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
	bars?: boolean,
	myPaths?: (scl: number) => uPlot.Series['paths']
};
export type CustomScale = uPlot.Scale & {
	scaleValue?: { min: number, max: number },
	positionValue?: { bottom: number, top: number },
};

const calcSize = (panel: Size) => ({ width: panel.width - 2, height: panel.height - 2 });

export function BasicPlot({ queryKey, queryFn, options: userOptions, axes: getAxes, series: getSeries, params }:
{ queryKey: any[], queryFn: () => Promise<any[][] | null>, params: BasicPlotParams,
	options?: () => Partial<uPlot.Options>, axes: () => CustomAxis[], series: () => CustomSeries[] }) {
	const query = useQuery({
		queryKey,
		queryFn
	});

	const defaultPos: DefaultPosition = (u, { width }) => ({
		x: (u.bbox.left + u.bbox.width - scaled(width)) / scaled(1) + 6, 
		y: u.bbox.top / scaled(1) });
	const [legendPos, legendSize, handleDragLegend] = usePlotOverlayPosition(defaultPos);

	const options = useCallback(() => {
		const axes = getAxes(), series = getSeries();
		const axSize = axisDefaults(false).size as number + axisDefaults(false).labelSize!;
		const padRight = axes.find(ax => ax.show === false && ax.side === 1) ? axSize : 0;
		const scaleOverrides = getParam('scalesParams');
		const uopts = userOptions?.();
		return {
			pxAlign: true,
			padding: [getFontSize() / 2, padRight, params.showTimeAxis ? 0 : getFontSize() / 2 - scaled(2), 0],
			legend: { show: params.interactive },
			cursor: {
				show: params.interactive,
				drag: { x: false, y: false, setScale: false }
			},
			scales: Object.fromEntries(axes?.map(ax => [ax.label, {
				distr: ax.distr ?? 1,
				...(ax.distr !== 3 && { range: (u, dmin, dmax) => {
					const override = scaleOverrides?.[ax.label];
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
				values: (u, vals) => vals.map(v => v?.toString().replace('-', '−')),
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
				paths: ser.myPaths?.(scaled(1)),
				width: scaled(ser.width ?? 1)
			}))),
			...uopts,
			hooks: {
				...uopts?.hooks,
				drawAxes: uopts?.hooks?.drawAxes ?? (params.showMetaInfo ? [
					drawMagneticClouds(params),
				] : []),
				draw: [
					drawCustomLabels(),
					...(params.showMetaInfo && !uopts?.hooks?.drawAxes ? [drawOnsets(params)] : []),
					drawCustomLegend(params, legendPos, legendSize, defaultPos),
					...(uopts?.hooks?.draw ?? [])
				],
				ready: [
					handleDragLegend
				].concat(uopts?.hooks?.ready ?? [] as any)
			}
		} as uPlot.Options;
	}, [params, query.data]); // eslint-disable-line
	
	if (query.isLoading)
		return <div className='Center'>LOADING...</div>;
	if (query.isError)
		return <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>;
	if (!query.data?.[0].length)
		return <div className='Center'>NO DATA</div>;

	return (<div style={{ position: 'absolute' }}>
		<ExportableUplot {...{ size: calcSize, options, data: query.data }}/>
	</div>);

}