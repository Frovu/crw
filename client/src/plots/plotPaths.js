import uPlot from 'uplot';
import { color, drawShape, drawArrow } from './plotUtil';

export function circlePaths(callback, minMaxMagn=5) {
	return (u, seriesIdx) => {
		uPlot.orient(u, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim) => {
			const strokeWidth = 1;
			const deg360 = 2 * Math.PI;
			const d = u.data[seriesIdx];

			const maxSize = Math.min(64, 5 + u.height / 12);
			// console.log('max size', maxSize);
			// console.time('circles');

			const maxMagn = Math.max(minMaxMagn, Math.max.apply(null, d[2].map(Math.abs)));

			u.ctx.save();
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
				let size = (Math.abs(d[2][i]) / maxMagn * maxSize + 1) * devicePixelRatio;
				if (size > maxSize) size = maxSize;

				if (xVal >= filtLft && xVal <= filtRgt && yVal >= filtBtm && yVal <= filtTop) {
					const cx = valToPosX(xVal, scaleX, xDim, xOff);
					const cy = valToPosY(yVal, scaleY, yDim, yOff);
					u.ctx.moveTo(cx + size/2, cy);
					u.ctx.beginPath();
					u.ctx.arc(cx, cy, size/2, 0, deg360);
					u.ctx.fill();
					u.ctx.stroke();
					callback && callback({
						x: cx - size/2 - strokeWidth/2 - u.bbox.left,
						y: cy - size/2 - strokeWidth/2 - u.bbox.top,
						w: size + strokeWidth,
						h: size + strokeWidth,
						sidx: seriesIdx,
						didx: i
					});
				}
			}
			// console.timeEnd('circles');
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

export function tracePaths(sizePx, arrows=true) {
	return (u, seriesIdx) => {
		const { left, top, width: fullWidth, height: fullHeight } = u.bbox;
		const height = fullHeight * .6;
		const width = fullWidth * .85;
		const dataX = u.data[seriesIdx+1]; // swapped
		const dataY = u.data[seriesIdx];
		const length = dataX.length;
		const x0 = dataX[0], y0 = dataY[0];
		let minx = x0, maxx = x0, miny = y0, maxy = y0;
		let x = minx, y = miny;
		for (let i = 0; i < length; i++) {
			x += dataX[i];
			y += dataY[i];
			if (x < minx) minx = x;
			if (y < miny) miny = y;
			if (x > maxx) maxx = x;
			if (y > maxy) maxy = y;
		}
		const xrange = maxx - minx;
		const yrange = maxy - miny;
		const scalex = width / Math.max(xrange, 20);
		const scaley = height / Math.max(yrange, 20);
		const shiftx = width * .6 - (minx + xrange / 2) * scalex;
		const shifty = (top + height / 2) - (miny + yrange / 2) * scaley;

		u.ctx.save(); // 2002 11 01
		u.ctx.beginPath();
		u.ctx.strokeStyle = u.series[seriesIdx].stroke();
		u.ctx.fillStyle = u.ctx.strokeStyle;
		u.ctx.lineWidth = 2;
		x = (y > y0 && x > x0) || (y < y0 && x < x0) ? left + fullWidth - 28 : left;
		y = top + 44;
		u.ctx.moveTo(x, y);
		const xarrow = Math.floor(64 / scalex);
		const yarrow = Math.floor(64 / scaley);
		drawArrow(u.ctx, 0, yarrow * scaley, x, y + yarrow * scaley);
		u.ctx.moveTo(x, y);
		drawArrow(u.ctx, xarrow * scalex, 0, x + xarrow * scalex, y);

		u.ctx.fillText(`Ax, ${yarrow}%`, x + 8, y + yarrow * scaley - 16);
		u.ctx.fillText(`Ay, ${xarrow}%`, x + xarrow * scalex - 40, y - 16);

		u.ctx.stroke();
		u.ctx.beginPath();

		u.ctx.lineWidth = .7;
		u.ctx.strokeStyle = color('green');
		const nLines = 10;
		const lineStep = Math.floor(length / nLines);
		const p = new Path2D();
		x = left + x0 * scalex + shiftx; y = top + y0 * scaley + shifty;
		p.moveTo(x, y);
		for (let i = 1; i < length - 1; i++) {
			const dx = dataX[i] * scalex;
			const dy = dataY[i] * scaley;
			x += dx;
			y += dy;
			arrows ? drawArrow(p, dx, dy, x, y, 7) : p.lineTo(x, y);
			p.moveTo(x, y);
			if (i % lineStep === 2) {
				const a0x = u.valToPos(u.data[0][i], 'x', true);
				const a0y = u.valToPos(u.data[1][i], 'a0', true);
				u.ctx.moveTo(x, y);
				u.ctx.lineTo(a0x, a0y);
			}
		}
		u.ctx.stroke();
		u.ctx.restore();

		return { stroke: p };
	};
}