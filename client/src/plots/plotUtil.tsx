import React, { MutableRefObject, useRef, useState } from 'react';
import { clamp, useSize } from '../util';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import { BasicPlotParams, ScaleParams, TextTransform } from './BasicPlot';

export type PlotsOverrides = {
	scale: number,
	fontSize: number,
	fontFamily?: string,
	scalesParams?: { [key: string]: ScaleParams },
	textTransform?: TextTransform[]
};

const defaultPlotsState: PlotsOverrides = {
	scale: 1,
	fontSize: 14
};

const poorCanvasCtx = document.createElement('canvas').getContext('2d')!;
export let applyOverrides: Partial<PlotsOverrides> | null = null;
export const withOverrides = <T extends any>(foo: () => T, overrides?: null | Partial<PlotsOverrides>): T => {
	applyOverrides = overrides ?? null;
	const res = foo();
	applyOverrides = null;
	return res;
};

export const measureDigit = () => {
	const height = getFontSize();
	poorCanvasCtx.font = font();
	const { width } = poorCanvasCtx.measureText('8');
	return { width, height };
};

export const getParam = <T extends keyof PlotsOverrides>(k: T) => {
	return applyOverrides?.[k] ?? defaultPlotsState[k];
};

export const scaled = (a: number) => a * getParam('scale');
export const getFontSize = () => Math.round(scaled(getParam('fontSize')));

export function color(name: string, opacity=1) {
	const col = window.getComputedStyle(document.body).getPropertyValue('--color-'+name) || 'red';
	const parts = col.includes('rgb') ? col.match(/[\d.]+/g)! :
		(col.startsWith('#') ? [1,2,3].map(d => parseInt(col.length===7 ? col.slice(1+(d-1)*2, 1+d*2) : col.slice(d, 1+d), 16) * (col.length===7 ? 1 : 17 )) : null);
	return parts ? `rgba(${parts.slice(0,3).join(',')},${parts.length > 3 && opacity === 1 ? parts[3] : opacity})` : col;
}

export function font(sz: number|null=null, scale: boolean=false, style: string='') {
	const family = window.getComputedStyle(document.body).font.split(/\s+/g).slice(1).join(' ');
	const sclSize = scaled(sz ?? getParam('fontSize'));
	const size = Math.round(scale ? sclSize * devicePixelRatio : sclSize);
	const famOv = getParam('fontFamily');
	return `${style} ${size}px ${famOv ? famOv + ', ' : ''} ${family}`;
}

export function superScript(digit: number) {
	return ['⁰', '¹', '² ', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'][digit];
}

export function axisDefaults(grid: boolean, filter?: uPlot.Axis.Filter): uPlot.Axis {
	const scl = getParam('scale');
	const { width, height } = measureDigit();
	return {
		font: font(),
		labelFont: font(),
		stroke: color('text'),
		labelSize: height + scl * 1 + 1, 
		labelGap: 0,
		space: height * 1.75,
		size: (width * 3) + scl * 10,
		gap: scl,
		grid: { show: grid ?? true, stroke: color('grid'), width: scl * 2 },
		ticks: { size: scl * 8, stroke: color('grid'), width: scl * 2, ...(filter && { filter }) },
		...(filter && { filter })
	};
}

export function seriesDefaults(name: string, colour: string, scale?: string) {
	return {
		width: scaled(1),
		scale: scale ?? name,
		label: name,
		stroke: color(colour),
		points: { fill: color('bg'), stroke: color(colour) }
	} as uPlot.Series;
}

export function customTimeSplits(params?: BasicPlotParams): Partial<uPlot.Axis> {
	const { height, width } = measureDigit();
	return {
		splits: (u, ax, min, max, incr, space) => {
			const num = Math.floor(u.width / space);
			const w = Math.ceil((max - min) / num);
			const split = ([ 4, 6, 12, 24 ].find(s => w <= s * 3600) || 48) * 3600;
			const start = Math.ceil(min / split) * split;
			const limit = Math.ceil((max - split/4 - start) / split);
			return Array(limit).fill(1).map((a, i) => start + i * split);
		},
		values: (u, splits) => splits.map((v, i) => {
			if (!params?.showTimeAxis || v % 86400 !== 0)
				return null;
			const d = new Date(v * 1e3);
			const month = String(d.getUTCMonth() + 1).padStart(2, '0');
			const day = String(d.getUTCDate()).padStart(2, '0');
			const showYear = (v - splits[0] < 86400) && String(d.getUTCFullYear());
			return (showYear ? showYear + '-' : '     ') + month + '-' + day;
		}),
		space: width * 5,
		gap: scaled(-1),
		...(params?.showTimeAxis === false && { ticks: { show: false } }),
		size: (params?.showTimeAxis ?? true) ? height + scaled(6) + 1 : 0
	};
}

export function drawArrow(ctx: CanvasRenderingContext2D | Path2D, dx: number, dy: number, tox: number, toy: number, hlen: number) {
	const angle = Math.atan2(dy, dx);
	ctx.lineTo(tox, toy);
	ctx.lineTo(tox - hlen * Math.cos(angle - Math.PI / 6), toy - hlen * Math.sin(angle - Math.PI / 6));
	ctx.moveTo(tox, toy);
	ctx.lineTo(tox - hlen * Math.cos(angle + Math.PI / 6), toy - hlen * Math.sin(angle + Math.PI / 6));
}

export type Shape = 'square' | 'circle' | 'arrow' | 'triangleUp' | 'triangleDown' | 'diamond';
export function drawShape(ctx: CanvasRenderingContext2D | Path2D, radius: number) {
	return {
		square: (x: number, y: number) => ctx.rect(x - radius*.7, y - radius*.7, radius*1.4, radius*1.4),
		circle: (x: number, y: number) => ctx.arc(x, y, radius * 0.75, 0, 2 * Math.PI),
		arrow: (x: number, y: number) => {
			ctx.moveTo(x - radius, y);
			const dx = radius * 2;
			drawArrow(ctx, dx, 0, x + dx, y, radius * 1.75);
			ctx.moveTo(x + dx, y);
			ctx.lineTo(x + radius, y);
			ctx.closePath();
		},
		triangleUp: (x: number, y: number) => {
			ctx.moveTo(x, y - radius);
			ctx.lineTo(x - radius, y + radius);
			ctx.lineTo(x + radius, y + radius);
			ctx.closePath();
		},
		triangleDown: (x: number, y: number) => {
			ctx.moveTo(x, y + radius);
			ctx.lineTo(x - radius, y - radius);
			ctx.lineTo(x + radius, y - radius);
			ctx.closePath();
		},
		diamond: (x: number, y: number) => {
			ctx.moveTo(x, y - radius);
			ctx.lineTo(x - radius, y);
			ctx.lineTo(x, y + radius);
			ctx.lineTo(x + radius, y);
			ctx.closePath();
		}
	} as { [shape in Shape]: (x: number, y: number) => void };
}

export function markersPaths(type: Shape, sizePx: number): uPlot.Series.PathBuilder {
	const size = scaled(sizePx * devicePixelRatio);
	return (u, seriesIdx) => {
		const p = new Path2D();
		uPlot.orient(u, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim, moveTo, lineTo, rect, arc) => {
			const radius = size / 2;
			const draw = drawShape(p, radius)[type];
			for (let i = 0; i < dataX.length; i++) {
				const val = dataY[i];
				if (val == null || val <= scaleY.min! || val >= scaleY.max!)
					continue;
				const cx = valToPosX(dataX[i], scaleX, xDim, xOff);
				const cy = valToPosY(val, scaleY, yDim, yOff);
				p.moveTo(cx + radius, cy);
				draw(cx, cy);
			}
		});
		return { fill: p, stroke: p };
	};
}

export function drawOnsets(params: BasicPlotParams, truncateY?: (u: uPlot) => number) {
	const captureOverrides = applyOverrides;
	return (u: uPlot) => withOverrides(() => {
		if (!params.showMetaInfo || !params.onsets?.length) return;
		for (const onset of params.onsets) {
			const x = u.valToPos(onset.time.getTime() / 1e3, 'x', true);
			if (x < u.bbox.left || x > u.bbox.left + u.bbox.width)
				continue;
			const useColor = onset.secondary ? color('text', .6) : color('white');
			const { height } = measureDigit();
			u.ctx.save();
			u.ctx.fillStyle = u.ctx.strokeStyle = useColor;
			u.ctx.font = font(null, true);
			u.ctx.textBaseline = 'bottom';
			u.ctx.textAlign = 'right';
			u.ctx.lineWidth = scaled(2 * devicePixelRatio);
			u.ctx.beginPath();
			const label = params.showMetaLabels;
			const minTop = 2 + (label ? height  : 0);
			const lineY = Math.max(truncateY?.(u) ?? 0, minTop);
			u.ctx.moveTo(x, lineY);
			u.ctx.lineTo(x, u.bbox.top + u.bbox.height);
			label && u.ctx.fillText(onset.type || 'ons', x + scaled(2), lineY);
			u.ctx.stroke();
			u.ctx.restore();
		}
	}, captureOverrides);
}

export function drawMagneticClouds(params: BasicPlotParams, truncateY?: (u: uPlot) => number) {
	const captureOverrides = applyOverrides;
	return (u: uPlot) => withOverrides(() => {
		if (!params.showMetaInfo || !params.clouds?.length) return;
		const patternCanvas = document.createElement('canvas');
		const ctx = patternCanvas.getContext('2d')!;
		const scale = scaled(devicePixelRatio);
		patternCanvas.height = patternCanvas.width = 16 * scale;
		ctx.fillStyle = color('area2');

		ctx.scale(scale, scale);
		ctx.moveTo(0, 6);
		ctx.lineTo(10, 16);
		ctx.lineTo(16, 16);
		ctx.lineTo(0, 0);
		ctx.moveTo(16, 0);
		ctx.lineTo(16, 6);
		ctx.lineTo(10, 0);
		ctx.fill();

		for (const cloud of params.clouds) {
			const startX = Math.max(u.bbox.left - scaled(4), u.valToPos(cloud.start.getTime() / 1e3, 'x', true));
			const endX = Math.min(u.bbox.width + u.bbox.left + scaled(4), u.valToPos(cloud.end.getTime() / 1e3, 'x', true));
			if (endX <= startX) continue;
			u.ctx.save();
			u.ctx.beginPath();
			u.ctx.fillStyle = u.ctx.createPattern(patternCanvas, 'repeat')!;
			const h = u.bbox.top + u.bbox.height - 2, fromY = truncateY?.(u) ?? 2;
			u.ctx.fillRect(startX, fromY, endX - startX, truncateY?.(u) ? (h - truncateY(u)) : h);
			u.ctx.fill();
			u.ctx.restore();
		}
	}, captureOverrides);
}

export type Size = { width: number, height: number };
export type Position = { x: number, y: number };
export type SizeRef = MutableRefObject<Size>;
export type PosRef = MutableRefObject<Position|null>;
export type DefaultPosition = (upl: uPlot, size: Size) => Position;
export function usePlotOverlayPosition(defaultPos: DefaultPosition)
	: [PosRef, SizeRef, (u: uPlot) => void] {
	const posRef = useRef<Position | null>(null);
	const sizeRef = useRef<Size>({ width: 0, height: 0 });
	const dragRef = useRef<{ click: Position, saved: Position } | null>(null);

	return [posRef, sizeRef, (u: uPlot) => {
		const getPosition = () => posRef.current ?? defaultPos(u, sizeRef.current);
		u.root.addEventListener('mousemove', e => {
			if (!dragRef.current) {
				if (posRef.current && (posRef.current?.x > u.width * devicePixelRatio - sizeRef.current.width
						|| posRef.current?.y > u.height * devicePixelRatio - sizeRef.current.height)) {
					posRef.current = null;
					u.redraw();
				}
				return;
			};

			const rect = u.root.getBoundingClientRect();
			const { saved, click } = dragRef.current;
			const dx = (e.clientX - rect.left) * devicePixelRatio - click.x;
			const dy = (e.clientY - rect.top)  * devicePixelRatio - click.y;
			const { width, height } = sizeRef.current;
			posRef.current = {
				x: clamp(2, u.width  * devicePixelRatio - width - 1, saved.x + dx),
				y: clamp(2, u.height * devicePixelRatio - height - 1, saved.y + dy)
			};
			u.redraw();
		});
		u.root.addEventListener('mousedown', e => {
			const rect = u.root.getBoundingClientRect();
			const x = (e.clientX - rect.left) * devicePixelRatio;
			const y = (e.clientY - rect.top) * devicePixelRatio;
			const pos = getPosition();
			const { width, height } = sizeRef.current;
			if (x! >= pos.x && x! <= pos.x + width
				&& y! >= pos.y && y! <= pos.y + height) {
				dragRef.current = { saved: { ...pos }, click: { x, y } };
			}
		});
		u.root.addEventListener('mouseleave', e => { dragRef.current = null; });
		u.root.addEventListener('mouseup', e => { dragRef.current = null; });
	}];
}

export function ScatterPlot({ data, colour }: { data: [number[], number[]][], colour: string }) {
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);
	return <div ref={setContainer} style={{ position: 'absolute' }}>
		<UplotReact data={[[], ...data] as any} options={{
			...size,
			mode: 2,
			padding: [8, 8, 0, 0],
			legend: { show: false },
			cursor: { show: false },
			axes: [
				{
					...axisDefaults(true),
					ticks: { show: false },
					scale: 'x',
					size: 24
				},
				{
					...axisDefaults(true),
					ticks: { show: false },
					scale: 'y',
					size: 30
				},
			],
			scales: {
				x: {
					time: false,
				},
				y: {
					range: (u, min, max) => [min, max]
				}
			},
			series: [
				{},
				{
					fill: color(colour),
					width: 1,
					paths: uPlot.paths.points!()
				},
				{
					stroke: color('white'),
					width: 1,
					paths: uPlot.paths.linear!({ alignGaps: 1 })
				}
			]
		}}/>

	</div>;
}