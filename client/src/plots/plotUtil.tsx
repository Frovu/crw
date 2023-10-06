import React, { MutableRefObject, useRef, useState } from 'react';
import { useSize } from '../util';
import uPlot from 'uplot';

import { MagneticCloud, Onset } from '../events/events';
import UplotReact from 'uplot-react';
import { create } from 'zustand';

export type TextTransform = {
	search: string,
	replace: string
};
export type ScaleParams = {
	min: number, max: number, bottom: number, top: number
};
export type OverrideScales = {
	[scale: string]: { }
};

export type BasicPlotParams = {
	interval: [Date, Date],
	onsets?: Onset[],
	clouds?: MagneticCloud[],
	interactive?: boolean,
	transformText?: TextTransform[],
	overrideScales?: { [scale: string]: ScaleParams },
	scalesCallback?: (scale: string, para: ScaleParams) => void
	stretch?: boolean,
	showTimeAxis: boolean,
	showMetaInfo: boolean
	showGrid: boolean,
	showMarkers: boolean,
	showLegend: boolean
};

type PlotsSate = {
	fontSize: number,
	fontFamily?: string,
};

const defaultPlotsState: PlotsSate = {
	fontSize: 14,
};

export const usePlotsOverrides = create<PlotsSate & {
	set: <T extends keyof PlotsSate>(k: T, val: PlotsSate[T]) => void
}>()(set => ({
	...defaultPlotsState,
	set: (k, v) => set(state => ({ ...state, [k]: v }))
}));

export let applyOverrides = false;
export const withOverrides = <T extends any>(foo: () => T, overrides: boolean): T => {
	applyOverrides = overrides;
	const res = foo();
	applyOverrides = false;
	return res;
};

const getParam = <T extends keyof PlotsSate>(k: T) => {
	const state = usePlotsOverrides.getState();
	return (applyOverrides ? state : defaultPlotsState)[k];
};

export const applyTextTransform = (transforms?: TextTransform[]) => (text: string) => {
	return transforms?.reduce((txt, { search, replace }) => {
		try {
			return txt.replace(new RegExp(search, 'g'), replace);
		} catch(e) {
			return txt;
		}
	}, text) ?? text;
};

export function color(name: string, opacity=1) {
	const col = window.getComputedStyle(document.body).getPropertyValue('--color-'+name) || 'red';
	const parts = col.includes('rgb') ? col.match(/[\d.]+/g)! :
		(col.startsWith('#') ? [1,2,3].map(d => parseInt(col.length===7 ? col.slice(1+(d-1)*2, 1+d*2) : col.slice(d, 1+d), 16) * (col.length===7 ? 1 : 17 )) : null);
	return parts ? `rgba(${parts.slice(0,3).join(',')},${parts.length > 3 && opacity === 1 ? parts[3] : opacity})` : col;
}

export function font(sz=0, scale=false) {
	const fnt = window.getComputedStyle(document.body).font;
	const size = getParam('fontSize') + sz;
	return fnt.replace(/\d+px/, (scale ? Math.round(size * devicePixelRatio) : size) + 'px');
}

export function superScript(digit: number) {
	return ['⁰', '¹', '² ', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'][digit];
}

export function axisDefaults(grid: boolean, filter?: uPlot.Axis.Filter): uPlot.Axis {
	return {
		font: font(),
		labelFont: font(),
		stroke: color('text'),
		labelSize: 20,
		labelGap: 0,
		space: 32,
		size: 44,
		gap: 2,
		grid: { show: grid ?? true, stroke: color('grid'), width: 2 },
		ticks: { stroke: color('grid'), width: 2, ...(filter && { filter }) },
		...(filter && { filter })
	};
}

export function seriesDefaults(name: string, colour: string, scale?: string) {
	return {
		scale: scale ?? name,
		label: name,
		stroke: color(colour),
		points: { fill: color('bg'), stroke: color(colour) }
	} as uPlot.Series;
}

export function customTimeSplits(params?: BasicPlotParams): Partial<uPlot.Axis> {
	return {
		splits: (u, ax, min, max, incr, space) => {
			const num = Math.floor(u.width / 76);
			const width = Math.ceil((max - min) / num);
			const split = ([ 4, 6, 12, 24 ].find(s => width <= s * 3600) || 48) * 3600;
			const start = Math.ceil(min / split) * split;
			const limit = Math.ceil((max - split/4 - start) / split);
			return Array(limit).fill(1).map((a, i) => start + i * split);
		},
		values: (u, splits) => splits.map((v, i) => {
			if (v % 86400 !== 0)
				return null;
			const d = new Date(v * 1e3);
			const month = String(d.getUTCMonth() + 1).padStart(2, '0');
			const day = String(d.getUTCDate()).padStart(2, '0');
			const showYear = (v - splits[0] < 86400) && String(d.getUTCFullYear());
			return (showYear ? showYear + '-' : '     ') + month + '-' + day;
		}),
		gap: 6,
		size: (params?.showTimeAxis ?? true) ? 32 : 4
	};
}

export function drawArrow(ctx: CanvasRenderingContext2D | Path2D, dx: number, dy: number, tox: number, toy: number, hlen=10*devicePixelRatio) {
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
	return (u, seriesIdx) => {
		const size = sizePx * devicePixelRatio;
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

export function drawOnsets(params: BasicPlotParams, truncateY?: number) {
	const captureOverrides = applyOverrides;
	return (u: uPlot) => withOverrides(() => {
		if (!params.onsets?.length) return;
		for (const onset of params.onsets) {
			const x = u.valToPos(onset.time.getTime() / 1e3, 'x', true);
			if (x < u.bbox.left || x > u.bbox.left + u.bbox.width)
				continue;
			const useColor = onset.secondary ? color('text', .6) : color('white');
			u.ctx.save();
			u.ctx.fillStyle = u.ctx.strokeStyle = useColor;
			u.ctx.font = font(0, true).replace('400', '600');
			u.ctx.textBaseline = 'top';
			u.ctx.textAlign = 'right';
			u.ctx.lineWidth = 2 * devicePixelRatio;
			u.ctx.beginPath();
			u.ctx.moveTo(x, truncateY ?? u.bbox.top);
			u.ctx.lineTo(x, u.bbox.top + u.bbox.height);
			params.showTimeAxis && u.ctx.fillText(onset.type || 'ons',
				x + 4, u.bbox.top + u.bbox.height + 2);
			u.ctx.stroke();
			u.ctx.restore();
		}
	}, captureOverrides);
}

export function drawMagneticClouds(params: BasicPlotParams, truncateY?: number) {
	const captureOverrides = applyOverrides;
	return (u: uPlot) => withOverrides(() => {
		if (!params.clouds?.length) return;
		const patternCanvas = document.createElement('canvas');
		const ctx = patternCanvas.getContext('2d')!;
		const scale = devicePixelRatio / 1;
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
			const startX = Math.max(u.bbox.left - 4, u.valToPos(cloud.start.getTime() / 1e3, 'x', true));
			const endX = Math.min(u.bbox.width + u.bbox.left + 4, u.valToPos(cloud.end.getTime() / 1e3, 'x', true));
			if (endX <= startX) continue;
			u.ctx.save();
			u.ctx.beginPath();
			u.ctx.fillStyle = u.ctx.createPattern(patternCanvas, 'repeat')!;
			const h = u.bbox.height, fromY = truncateY ?? u.bbox.top;
			u.ctx.fillRect(startX, fromY, endX - startX, truncateY ? (h + u.bbox.top - truncateY) : h);
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
				x: Math.max(2, Math.min(saved.x + dx, u.width  * devicePixelRatio - width - 2)),
				y: Math.max(2, Math.min(saved.y + dy, u.height * devicePixelRatio - height - 2))
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

export function clickDownloadPlot(e: React.MouseEvent | MouseEvent) {
	if (!e.altKey && !e.ctrlKey)
		return;
	const src = (e.target as HTMLElement).closest('.uplot')?.querySelector('canvas');
	if (!src)
		return console.log('not found plot (click)');
		
	const canvas = document.createElement('canvas');
	canvas.width = src.width;
	canvas.height = src.height;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = color('bg');
	ctx.fillRect(0, 0, src.width, src.height);
	ctx.drawImage(src, 0, 0);

	if (e.altKey) {
		const a = document.createElement('a');
		a.download = 'aid_plot.png';
		a.href = canvas.toDataURL()!;
		return a.click();
	}
	canvas.toBlob(blob => {
		blob && window.open(URL.createObjectURL(blob));
	});
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