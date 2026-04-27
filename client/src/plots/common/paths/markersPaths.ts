import uPlot from 'uplot';
import { scaled } from '../plotUtil';
import type { Shape } from '../types';

export function drawArrow(
	ctx: CanvasRenderingContext2D | Path2D,
	dx: number,
	dy: number,
	tox: number,
	toy: number,
	hlen: number,
) {
	const angle = Math.atan2(dy, dx);
	ctx.lineTo(tox, toy);
	ctx.lineTo(tox - hlen * Math.cos(angle - Math.PI / 6), toy - hlen * Math.sin(angle - Math.PI / 6));
	ctx.moveTo(tox, toy);
	ctx.lineTo(tox - hlen * Math.cos(angle + Math.PI / 6), toy - hlen * Math.sin(angle + Math.PI / 6));
}

export function drawShape(ctx: CanvasRenderingContext2D | Path2D, radius: number) {
	return {
		square: (x: number, y: number) => ctx.rect(x - radius * 0.7, y - radius * 0.7, radius * 1.4, radius * 1.4),
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
		},
	} as { [shape in Shape]: (x: number, y: number) => void };
}

export function markersPaths(type: Shape, sizePx: number): uPlot.Series.PathBuilder {
	const size = scaled(sizePx * devicePixelRatio);
	return (u, seriesIdx) => {
		const p = new Path2D();
		uPlot.orient(
			u,
			seriesIdx,
			(series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim, moveTo, lineTo, rect, arc) => {
				const radius = size / 2;
				const draw = drawShape(p, radius)[type];
				for (let i = 0; i < dataX.length; i++) {
					const val = dataY[i];
					if (val == null || val <= scaleY.min! || val >= scaleY.max!) continue;
					const cx = valToPosX(dataX[i], scaleX, xDim, xOff);
					const cy = valToPosY(val, scaleY, yDim, yOff);
					p.moveTo(cx + radius, cy);
					draw(cx, cy);
				}
			},
		);
		return { fill: p, stroke: p };
	};
}
