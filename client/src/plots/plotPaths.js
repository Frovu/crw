import uPlot from 'uplot';
import { scaled } from './plotUtil';
import { clamp } from '../util';

export function circlesSizeComputer(u, params, data, minMaxMagn) {
	const maxSize = u.height / 10 + (params.sizeShift ?? 0);
	const maxMagn = Math.max(minMaxMagn, Math.max.apply(null, data.map(Math.abs)));
	return (v) => {
		const sz = params.linearSize ? (Math.abs(v) / maxMagn) * maxSize : (maxSize * (10 - Math.pow((Math.abs(v) + 38.7) / 50, -9))) / 10;
		return Math.max(scaled(1.5), sz) * devicePixelRatio;
	};
}

export function circlePaths(rectCallback, minMaxMagn, params) {
	const strokeWidth = clamp(1.5, 8, scaled(devicePixelRatio) / 1.5);
	return (u, seriesIdx) => {
		uPlot.orient(u, seriesIdx, (series, dataX, datapeY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim) => {
			const deg360 = 2 * Math.PI;
			const d = u.data[seriesIdx];

			const maxSize = u.height / 10 + (params.sizeShift ?? 0);
			const sizeComp = circlesSizeComputer(u, params, d[2], minMaxMagn);

			u.ctx.save();
			u.ctx.beginPath();
			u.ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
			u.ctx.clip();
			u.ctx.fillStyle = series.fill();
			u.ctx.strokeStyle = series.stroke();
			u.ctx.lineWidth = strokeWidth;

			const filtLft = u.posToVal(-maxSize / 2, scaleX.key);
			const filtRgt = u.posToVal(u.bbox.width / devicePixelRatio + maxSize / 2, scaleX.key);
			const filtBtm = u.posToVal(u.bbox.height / devicePixelRatio + maxSize / 2, scaleY.key);
			const filtTop = u.posToVal(-maxSize / 2, scaleY.key);

			for (let i = 0; i < d[0].length; i++) {
				const xVal = d[0][i];
				const yVal = d[1][i];
				const size = sizeComp(d[2][i]);

				if (xVal >= filtLft && xVal <= filtRgt && yVal >= filtBtm && yVal <= filtTop) {
					const cx = valToPosX(xVal, scaleX, xDim, xOff);
					const cy = valToPosY(yVal, scaleY, yDim, yOff);
					u.ctx.moveTo(cx + size / 2, cy);
					u.ctx.beginPath();
					u.ctx.arc(cx, cy, size / 2, 0, deg360);
					u.ctx.fill();
					u.ctx.stroke();
					rectCallback &&
						rectCallback({
							x: cx - size / 2 - strokeWidth / 2 - u.bbox.left,
							y: cy - size / 2 - strokeWidth / 2 - u.bbox.top,
							w: size + strokeWidth,
							h: size + strokeWidth,
							sidx: seriesIdx,
							didx: i,
						});
				}
			}
			u.ctx.restore();
		});
		return null;
	};
}

export function linePaths(width = 1) {
	return (u, seriesIdx) => {
		uPlot.orient(u, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim) => {
			const d = u.data[seriesIdx];
			const ss = u.ctx.strokeStyle;
			const ww = u.ctx.lineWidth;
			u.ctx.strokeStyle = series.stroke();
			u.ctx.lineWidth = width * devicePixelRatio;
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

export function pointPaths(sizePx, rectCallback) {
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
					rectCallback &&
						rectCallback({
							x: cx - size / 2 - 2 - u.bbox.left,
							y: cy - size / 2 - 2 - u.bbox.top,
							w: size + 4,
							h: size + 4,
							sidx: seriesIdx,
							didx: i,
						});
					p.moveTo(cx + size / 2, cy);
					arc(p, cx, cy, size / 2, 0, deg360);
				}
			}
			u.ctx.fill(p);
		});
		return null;
	};
}
