import React, { useState } from 'react';
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
	paddingBottom?: number,
	showTimeAxis?: boolean,
	showGrid: boolean,
	showMarkers: boolean,
	showLegend: boolean
};

export function drawArrow(ctx: CanvasRenderingContext2D, dx: number, dy: number, tox: number, toy: number, headlen=10) {
	const angle = Math.atan2(dy, dx);
	ctx.lineTo(tox, toy);
	ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
	ctx.moveTo(tox, toy);
	ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
}

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
	};
}

export function drawOnsets(u: uPlot, onsets: Onset[]) {
	for (const onset of onsets) {
		const OnsetX = u.valToPos(onset.time.getTime() / 1e3, 'x', true);
		const useColor = onset.secondary ? color('text', .6) : color('white');
		u.ctx.save();
		u.ctx.fillStyle = u.ctx.strokeStyle = useColor;
		u.ctx.font = font(14, true).replace('400', '600');
		u.ctx.textBaseline = 'top';
		u.ctx.lineWidth = 2 * devicePixelRatio;
		u.ctx.beginPath();
		u.ctx.moveTo(OnsetX, u.bbox.top);
		u.ctx.lineTo(OnsetX, u.bbox.top + u.bbox.height);
		u.ctx.stroke();
		u.ctx.fillText(onset.type || 'ons',
			OnsetX + 4, u.bbox.top + u.bbox.height + 2);
		u.ctx.restore();
	}
}

export function drawMagneticClouds(u: uPlot, clouds: MagneticCloud[]) {
	for (const cloud of clouds) {
		const startX = u.valToPos(cloud.start.getTime() / 1e3, 'x', true);
		const endX = u.valToPos(cloud.end.getTime() / 1e3, 'x', true);
		u.ctx.save();
		u.ctx.fillStyle = u.ctx.strokeStyle = color('area2', .1);
		u.ctx.fillRect(startX, u.bbox.top, endX - startX, u.bbox.height);
		u.ctx.restore();
	}
}

export function drawCustomLegend(fullLabels: {[ser: string]: string}, shapes?: {[ser: string]: string}) {
	let xpos = -99, ypos = 0;
	let xposClick = xpos, yposClick = ypos;
	let clickx: number|null = null, clicky: number|null = null, drag = false;
	return (u: uPlot) => {
		const series: any[] = Object.keys(fullLabels).map(lbl => u.series.find(s => s.label === lbl)).filter(s => s?.show!);
		const labels = series.map(s => fullLabels[s.label]);

		const maxLabelLen = Math.max.apply(null, labels.map(l => l.length));
		const width = 52 + 8 * maxLabelLen;
		const height = series.length * 20 + 4;

		if (xpos < -90)
			xpos = 8 + u.bbox.width - width;

		const x = u.bbox.left + xpos;
		let y = u.bbox.top + ypos;
		u.ctx.save();
		u.ctx.lineWidth = 2;
		u.ctx.strokeStyle = color('text-dark');
		u.ctx.fillStyle = color('bg');
		u.ctx.fillRect(x, y, width, height);
		u.ctx.strokeRect(x, y, width, height);
		u.ctx.font = font(14);
		u.ctx.textAlign = 'left';
		u.ctx.lineCap = 'butt';
		y += 12;
		const draw = drawShape(u.ctx, 6) as any;
		for (const [i, s] of series.entries()) {
			u.ctx.lineWidth = 2;
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
			y += 20;
		}
		u.ctx.restore();

		// FIXME: eh
		u.over.onmousemove = e => {
			if (!drag) return;
			const dx = e.offsetX - clickx!;
			const dy = e.offsetY - clicky!;
			xpos = Math.max(-8, Math.min(xposClick + dx, 8 + u.bbox.width - width));
			ypos = Math.max(0, Math.min(yposClick + dy, 12 + u.bbox.height - height));
			u.redraw();
		};
		u.over.onmousedown = e => {
			clickx = e.offsetX;
			clicky = e.offsetY;
			if (clickx! > xpos && clickx! < xpos + width && clicky! > ypos && clicky! < ypos + height) {
				xposClick = xpos;
				yposClick = ypos;
				drag = true;
			}
		};
		u.over.onmouseup = u.over.onmouseleave = e => {
			drag = false;
		};
	};
}

export function drawCustomLabels(scales: {[scale: string]: string | [string, number]}) {
	return (u: uPlot) => {
		for (const [scale, value] of Object.entries(scales)) {
			const [label, shift] = typeof value === 'string' ? [value, 0] : value;
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
				Math.round(u.bbox.top + u.bbox.height / 2 + flowDir * u.ctx.measureText(label).width / 2 + shift * devicePixelRatio),
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
	u.ctx.fillRect(0, 0, u.width, u.height);
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
		size: !params || params.showTimeAxis ? 32 : 2,
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
	const parts = col.includes('rgb') ? col.match(/[\d.]+/g)!.slice(0,3) :
		(col.startsWith('#') ? [1,2,3].map(d => parseInt(col.length===7 ? col.slice(1+(d-1)*2, 1+d*2) : col.slice(d, 1+d), 16) * (col.length===7 ? 1 : 17 )) : null);
	return parts ? `rgba(${parts.join(',')},${opacity})` : col;
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

export function clickDownloadPlot(e: React.MouseEvent) {
	if (e.altKey) {
		const a = document.createElement('a');
		a.download = 'aid_plot.png';
		const canvas = (e.target as HTMLElement).closest('.uplot')?.querySelector('canvas');
		if (!canvas)
			return console.log('not found plot (click)');
		a.href = canvas.toDataURL()!;
		a.click();
	}
}

export function BasicPlot({ queryKey, queryFn, options: userOptions }:
{ queryKey: any[], queryFn: () => Promise<any[][] | null>, options: Partial<uPlot.Options>}) {
	const query = useQuery({
		queryKey,
		queryFn,
		staleTime: 36e5,
	});

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	if (query.isLoading)
		return <div className='Center'>LOADING...</div>;
	if (query.isError)
		return <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>;
	if (!query.data)
		return <div className='Center'>NO DATA</div>;

	const options = { ...size, ...userOptions } as uPlot.Options;
	options.hooks = { ...options.hooks, drawClear: (options.hooks?.drawClear ?? []).concat(drawBackground) };

	return (<div ref={node => setContainer(node)} style={{ position: 'absolute' }} onClick={clickDownloadPlot}>
		<UplotReact {...{ options, data: query.data as any }}/>
	</div>);

}