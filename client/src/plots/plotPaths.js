import uPlot from 'uplot';
import { drawShape } from './plotUtil';

export function linePaths(width = 1) {
	return (u, seriesIdx) => {
		uPlot.orient(u, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim) => {
			const d = u.data[seriesIdx];
			const ss = u.ctx.strokeStyle;
			const ww = u.ctx.lineWidth;
			u.ctx.strokeStyle = series.stroke();
			u.ctx.lineWidth = width;
			const p = new Path2D();
			for (let i = 0; i < d[0].length; i++) {
				const xVal = d[0][i];
				const yVal = d[1][i];
				if (xVal >= scaleX.min && xVal <= scaleX.max && yVal >= scaleY.min && yVal <= scaleY.max) {
					const cx = valToPosX(xVal, scaleX, xDim, xOff);
					const cy = valToPosY(yVal, scaleY, yDim, yOff);
					p.lineTo(cx, cy);
				}
			}
			u.ctx.stroke(p);
			u.ctx.strokeStyle = ss;
			u.ctx.lineWidth = ww;
		});
		return null;
	};
}

export function pointPaths(sizePx) {
	return (u, seriesIdx) => {
		const size = sizePx * devicePixelRatio;
		uPlot.orient(u, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim, moveTo, lineTo, rect, arc) => {
			const d = u.data[seriesIdx];
			u.ctx.fillStyle = series.stroke();
			const deg360 = 2 * Math.PI;
			const p = new Path2D();
			for (let i = 0; i < d[0].length; i++) {
				const xVal = d[0][i];
				const yVal = d[1][i];
				if (xVal >= scaleX.min && xVal <= scaleX.max && yVal >= scaleY.min && yVal <= scaleY.max) {
					const cx = valToPosX(xVal, scaleX, xDim, xOff);
					const cy = valToPosY(yVal, scaleY, yDim, yOff);
					p.moveTo(cx + size/2, cy);
					arc(p, cx, cy, size/2, 0, deg360);
				}
			}
			u.ctx.fill(p);
		});
		return null;
	};
}

export function markersPaths(type, sizePx) {
	return (u, seriesIdx) => {
		const size = sizePx * devicePixelRatio;
		const p = new Path2D();
		uPlot.orient(u, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim, moveTo, lineTo, rect, arc) => {
			const radius = size / 2;
			const draw = drawShape(p, radius)[type];
			for (let i = 0; i < dataX.length; i++) {
				const val = dataY[i];
				if (val == null || val <= scaleY.min || val >= scaleY.max)
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