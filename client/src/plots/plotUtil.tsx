import React, { MutableRefObject, useRef, useState } from 'react';
import { useQuery } from 'react-query';
import { useSize } from '../util';
import uPlot from 'uplot';

import { MagneticCloud, Onset } from '../table/Table';
import UplotReact from 'uplot-react';

export type BasicPlotParams = {
	interval: [Date, Date],
	onsets?: Onset[],
	clouds?: MagneticCloud[],
	interactive?: boolean,
	showTimeAxis: boolean,
	showMetaInfo: boolean
	showGrid: boolean,
	showMarkers: boolean,
	showLegend: boolean
};

export function drawArrow(ctx: CanvasRenderingContext2D | Path2D, dx: number, dy: number, tox: number, toy: number, headlen=10) {
	const angle = Math.atan2(dy, dx);
	ctx.lineTo(tox, toy);
	ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
	ctx.moveTo(tox, toy);
	ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
}

type Shape = 'square' | 'circle' | 'arrow' | 'triangleUp' | 'triangleDown' | 'diamond';
export function drawShape(ctx: CanvasRenderingContext2D, radius: number) {
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

export function drawOnsets(u: uPlot, onsets: Onset[], hideLabel?: boolean) {
	for (const onset of onsets) {
		const OnsetX = u.valToPos(onset.time.getTime() / 1e3, 'x', true);
		const useColor = onset.secondary ? color('text', .6) : color('white');
		u.ctx.save();
		u.ctx.fillStyle = u.ctx.strokeStyle = useColor;
		u.ctx.font = font(14, true).replace('400', '600');
		u.ctx.textBaseline = 'top';
		u.ctx.textAlign = 'right';
		u.ctx.lineWidth = 2 * devicePixelRatio;
		u.ctx.beginPath();
		u.ctx.moveTo(OnsetX, u.bbox.top);
		u.ctx.lineTo(OnsetX, u.bbox.top + u.bbox.height);
		!hideLabel && u.ctx.fillText(onset.type || 'ons',
			OnsetX + 4, u.bbox.top + u.bbox.height + 2);
		u.ctx.stroke();
		u.ctx.restore();
	}
}

export function drawMagneticClouds(u: uPlot, clouds: MagneticCloud[], truncateY?: number) {
	const patternCanvas = document.createElement('canvas');
	const ctx = patternCanvas.getContext('2d')!;
	patternCanvas.height = patternCanvas.width = 16;
	ctx.fillStyle = color('area2');

	ctx.moveTo(10, 0);
	ctx.lineTo(0, 10);
	ctx.lineTo(0, 16);
	ctx.lineTo(16, 0);
	ctx.moveTo(10, 16);
	ctx.lineTo(16, 10);
	ctx.lineTo(16, 16);
	ctx.fill();

	for (const cloud of clouds) {
		const startX = u.valToPos(cloud.start.getTime() / 1e3, 'x', true);
		const endX = u.valToPos(cloud.end.getTime() / 1e3, 'x', true);
		u.ctx.save();
		u.ctx.beginPath();
		u.ctx.fillStyle = u.ctx.createPattern(patternCanvas, 'repeat')!;
		const h = u.bbox.height, fromY = truncateY ?? u.bbox.top;
		u.ctx.fillRect(startX, fromY, endX - startX, truncateY ? (h + u.bbox.top - truncateY) : h);
		u.ctx.fill();
		u.ctx.restore();
	}
}

type Size = { width: number, height: number };
type Position = { x: number, y: number };
export function usePlotOverlayPosition(defaultPos: Position | ((upl: uPlot, size: Size) => Position))
	: [MutableRefObject<Position|null>, MutableRefObject<Size>, (u: uPlot) => void] {
	const posRef = useRef<Position | null>(null);
	const sizeRef = useRef<Size>({ width: 0, height: 0 });
	let clickX = 0, clickY = 0, drag = false;
	let savedPos = { x: 0, y: 0 };

	return [posRef, sizeRef, (u: uPlot) => {
		const getPosition = () => posRef.current ?? (typeof defaultPos == 'function' ? defaultPos(u, sizeRef.current) : defaultPos);
		u.root.addEventListener('mousemove', e => {
			if (!drag) {
				if (posRef.current && posRef.current?.x > u.width * devicePixelRatio - sizeRef.current.width) {
					posRef.current = null;
					u.redraw();
				}
				return;
			};

			const rect = u.root.getBoundingClientRect();
			const dx = (e.clientX - rect.left) * devicePixelRatio - clickX;
			const dy = (e.clientY - rect.top)  * devicePixelRatio - clickY;
			const { width, height } = sizeRef.current;
			posRef.current = {
				x: Math.max(2, Math.min(savedPos.x + dx, u.width  * devicePixelRatio - width - 2)),
				y: Math.max(2, Math.min(savedPos.y + dy, u.height * devicePixelRatio - height - 2))
			};
			u.redraw();
		});
		u.root.addEventListener('mousedown', e => {
			const rect = u.root.getBoundingClientRect();
			clickX = (e.clientX - rect.left) * devicePixelRatio;
			clickY = (e.clientY - rect.top) * devicePixelRatio;
			const pos = getPosition();
			const { width, height } = sizeRef.current;
			console.log(pos.x, clickX, pos.x + width);
			console.log(pos.y, clickY, pos.y + height);
			if (clickX! >= pos.x && clickX! <= pos.x + width
				&& clickY! >= pos.y && clickY! <= pos.y + height) {
				savedPos = pos;
				drag = true;
			}
		});
		u.root.addEventListener('mouseleave', e => { drag = false; });
		u.root.addEventListener('mouseup', e => { drag = false; });
	}];
}

type CustomLegendLabels = {[ser: string]: string};
type CustomLegendShapes = {[ser: string]: Shape};
export function drawCustomLegend(position: MutableRefObject<Position|null>, size: MutableRefObject<Size>, fullLabels: CustomLegendLabels, shapes?: CustomLegendShapes) {
	return (u: uPlot) => {
		const series: any[] = Object.keys(fullLabels).map(lbl => u.series.find(s => s.label === lbl)).filter(s => s?.show!);
		const labels = series.map(s => fullLabels[s.label]);

		u.ctx.font = font(14 * devicePixelRatio);
		const maxLabelLen = Math.max.apply(null, labels.map(l => l.length));
		const metric = u.ctx.measureText('a'.repeat(maxLabelLen));
		const lineHeight = metric.fontBoundingBoxAscent + metric.fontBoundingBoxDescent + 1;
		const width = 48 + metric.width;
		const height = series.length * lineHeight + 4;
		size.current = { width, height };

		const maxX = u.bbox.left + u.bbox.width - width;
		const pos = position.current ?? { x: maxX, y: u.bbox.top };

		const x = pos.x;
		let y = pos.y;
		u.ctx.save();
		u.ctx.lineWidth = 2 * devicePixelRatio;
		u.ctx.strokeStyle = color('text-dark');
		u.ctx.fillStyle = color('bg');
		u.ctx.fillRect(x, y, width, height);
		u.ctx.strokeRect(x, y, width, height);
		u.ctx.textAlign = 'left';
		u.ctx.lineCap = 'butt';
		y += lineHeight / 2 + 3;
		const draw = drawShape(u.ctx, 6 * devicePixelRatio);
		for (const [i, s] of series.entries()) {
			u.ctx.lineWidth = 2 * devicePixelRatio;
			u.ctx.fillStyle = u.ctx.strokeStyle = s.stroke();
			u.ctx.beginPath();
			u.ctx.moveTo(x + 8, y);
			u.ctx.lineTo(x + 32, y);
			u.ctx.stroke();
			const shape = shapes?.[s.label];
			u.ctx.lineWidth = shape === 'arrow' ? 2 : 1;
			if (shape) draw[shape](x + 20, y,);
			if (shape !== 'arrow')
				u.ctx.fill();
			u.ctx.fillStyle = color('text');
			u.ctx.fillText(labels[i], x + 40, y);
			u.ctx.stroke();
			y += lineHeight;
		}
		u.ctx.restore();
	};
}

type CustomLabelsDesc = { [scale: string]: string | [string, number] | [string, number, number] };
// [ label, shift (multiplied by height), shift (pixels) ]
function drawCustomLabels(scales: CustomLabelsDesc) {
	return (u: uPlot) => {
		for (const [scale, value] of Object.entries(scales)) {
			const [label, shiftMulti, shiftPx] = typeof value === 'string' ? [value, 0, 0]
				: value.concat(value.length < 3 ? [0] : []) as [string, number, number];
			const axis = u.axes.find(ax => ax.scale === scale);
			if (!axis) continue;
			if (axis.side && axis.side % 2 === 0)
				return console.error('only implemented left or right axis');

			const rec = (txt: string): string[][] => {
				if (!txt) return [];
				const si = u.series.findIndex(s => txt.includes(s.label!));
				const series = si >= 0 && u.series[si];
				if (!series) return [[txt, color('text')]];
				const split = txt.split(series.label!);
				const stroke = typeof series.stroke === 'function' ? series.stroke(u, si) : series.stroke;
				return [...rec(split[0]), [series.label!, stroke as string], ...rec(split[1])];
			};
			
			const flowDir = axis.side === 0 || axis.side === 3 ? 1 : -1;
			const baseX = axis.label != null ? (axis as any)._lpos : (axis as any)._pos + (axis as any)._size / 2;
			u.ctx.save();
			u.ctx.font = font(14, true);
			u.ctx.translate(
				Math.round((baseX + axis.labelGap! * flowDir * -1) * devicePixelRatio),
				Math.round(u.bbox.top + u.bbox.height / 2 + flowDir * u.ctx.measureText(label).width / 2
					+ (u.height * shiftMulti + shiftPx) * devicePixelRatio),
			);
			u.ctx.rotate((axis.side === 3 ? -Math.PI : Math.PI) / 2);
			u.ctx.textBaseline = axis.label != null ? 'bottom' : 'middle';
			u.ctx.textAlign = 'left';
			let x = 0;
			for (const [text, stroke] of rec(label)) {
				u.ctx.fillStyle = stroke;
				u.ctx.fillText(text, x, 0);
				x += u.ctx.measureText(text).width;
			}
			u.ctx.restore();
		}
	};
}

export function drawBackground(u: uPlot) {
	u.ctx.save();
	u.ctx.fillStyle = color('bg');
	u.ctx.fillRect(0, 0, u.width * devicePixelRatio, u.height * devicePixelRatio);
	u.ctx.restore();
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
		size: !params || params.showTimeAxis ? 30 : 4
	};
}

export function axisDefaults(grid: boolean): Partial<uPlot.Axis> {
	return {
		font: font(14),
		labelFont: font(14),
		stroke: color('text'),
		labelSize: 20,
		labelGap: 0,
		size: 40,
		gap: 2,
		grid: { show: grid ?? true, stroke: color('grid'), width: 2 },
		ticks: { stroke: color('grid'), width: 2 },
	};
}

export function color(name: string, opacity=1) {
	const col = window.getComputedStyle(document.body).getPropertyValue('--color-'+name) || 'red';
	const parts = col.includes('rgb') ? col.match(/[\d.]+/g)! :
		(col.startsWith('#') ? [1,2,3].map(d => parseInt(col.length===7 ? col.slice(1+(d-1)*2, 1+d*2) : col.slice(d, 1+d), 16) * (col.length===7 ? 1 : 17 )) : null);
	return parts ? `rgba(${parts.slice(0,3).join(',')},${parts.length > 3 && opacity === 1 ? parts[3] : opacity})` : col;
}

export function font(size=16, scale=false) {
	const fnt = window.getComputedStyle(document.body).font;
	return fnt.replace(/\d+px/, (scale ? Math.round(size * devicePixelRatio) : size) + 'px');
}

export function superScript(digit: number) {
	return ['⁰', '¹', '² ', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'][digit];
}

export async function basicDataQuery(path: string, interval: [Date, Date], fields: string[], params?: {}) {
	const urlPara = new URLSearchParams({
		from: (interval[0].getTime() / 1000).toFixed(0),
		to:   (interval[1].getTime() / 1000).toFixed(0),
		fields: fields.join(),
		...params
	}).toString();
	const res = await fetch(process.env.REACT_APP_API + path + '?' + urlPara);
	if (res.status !== 200)
		throw Error('HTTP '+res.status);
	const body = await res.json() as { data: any[][], fields: string[] };
	if (!body?.data.length) return null;
	const fieldsIdxs = fields.map(f => body.fields.indexOf(f));
	const ordered = fieldsIdxs.map(i => body.data.map(row => row[i]));
	console.log(path, '=>', ordered, fields);
	return ordered;
}

export function clickDownloadPlot(e: React.MouseEvent | MouseEvent) {
	if (e.altKey || e.ctrlKey) {
		const a = document.createElement('a');
		if (e.altKey)
			a.download = 'aid_plot.png';
		else
			a.target = '_blank';
		const canvas = (e.target as HTMLElement).closest('.uplot')?.querySelector('canvas');
		if (!canvas)
			return console.log('not found plot (click)');
		a.href = canvas.toDataURL()!;
		a.click();
	}
}

export function BasicPlot({ queryKey, queryFn, options: userOptions, params, labels, legend }:
{ queryKey: any[], queryFn: () => Promise<any[][] | null>, options: Partial<uPlot.Options>,
	params: BasicPlotParams, labels?: CustomLabelsDesc, legend?: [CustomLegendLabels, CustomLegendShapes] | CustomLegendLabels }) {
	const query = useQuery({
		queryKey,
		queryFn
	});

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	const [legendPos, legendSize, handleDragLegend] = usePlotOverlayPosition((u, { width }) => ({
		x: u.bbox.left + u.bbox.width - width, 
		y: u.bbox.top }));

	if (query.isLoading)
		return <div className='Center'>LOADING...</div>;
	if (query.isError)
		return <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>;
	if (!query.data)
		return <div className='Center'>NO DATA</div>;

	const options = {
		...size,
		padding: [8, 0, params.showTimeAxis ? 0 : 8, 0],
		legend: { show: params.interactive },
		cursor: {
			show: params.interactive,
			drag: { x: false, y: false, setScale: false }
		},
		...userOptions
	} as uPlot.Options;
	options.hooks = {
		...options.hooks,
		drawClear: (options.hooks?.drawClear ?? []).concat(drawBackground),
		drawAxes: options.hooks?.drawAxes ?? (params.showMetaInfo ? [
			u => (params.clouds?.length) && drawMagneticClouds(u, params.clouds),
		] : []),
		draw: [
			...(params.showMetaInfo ? [(u: uPlot) => (params.onsets?.length) && drawOnsets(u, params.onsets, !params.showTimeAxis)] : []),
			...(labels ? [drawCustomLabels(labels)] : []),
			...(legend && params.showLegend ? [drawCustomLegend(legendPos, legendSize, ...(Array.isArray(legend) ? legend : [legend]) as [any])] : []),
			...(options.hooks?.draw ?? [])
		],
		ready: [
			handleDragLegend
		].concat(options.hooks?.ready ?? [] as any)
	};

	return (<div ref={node => setContainer(node)} style={{ position: 'absolute' }} onClick={clickDownloadPlot}>
		<UplotReact {...{ options, data: query.data as any }}/>
	</div>);

}