import uPlot from 'uplot';

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
			const deg360 = 2 * Math.PI;
			const radius = size / 2;
			const draw = {
				square: (x, y) => rect(p, x - radius, y - radius, size, size),
				circle: (x, y) => arc(p, x, y, radius, 0, deg360),
				triangleUp: (x, y) => {
					moveTo(p, x, y - radius);
					lineTo(p, x - radius, y + radius);
					lineTo(p, x + radius, y + radius);
					p.closePath();
				},
				triangleDown: (x, y) => {
					moveTo(p, x, y + radius);
					lineTo(p, x - radius, y - radius);
					lineTo(p, x + radius, y - radius);
					p.closePath();
				},
				diamond: (x, y) => {
					moveTo(p, x, y - radius);
					lineTo(p, x - radius, y);
					lineTo(p, x, y + radius);
					lineTo(p, x + radius, y);
					p.closePath();
				}
			}[type];
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

export function tracePaths(sizePx) {
	return (u, seriesIdx) => {
		const size = sizePx * devicePixelRatio;
		const { left, top, width: fullWidth, height: fullHeight } = u.bbox;
		const height = fullHeight / 2;
		const width = fullWidth * .85;
		const dataX = u.data[seriesIdx];
		const dataY = u.data[seriesIdx+1];
		const length = dataX.length;
		const pathX = Array(length), pathY = Array(length);
		const x0 = dataX[0], y0 = dataY[0];
		let minx = x0, maxx = x0, miny = y0, maxy = y0;
		let x = minx, y = miny;
		for (let i = 0; i < length; i++) {
			pathX[i] = x;
			pathY[i] = y;
			x += dataX[i];
			y += dataY[i];
			if (x < minx) minx = x;
			if (y < miny) miny = y;
			if (x > maxx) maxx = x;
			if (y > maxy) maxy = y;
		}
		const scalex = width / (maxx - minx);
		const scaley = height / (maxy - miny);
		const shiftx = width * .2 - minx * scalex;
		const shifty = 20 * devicePixelRatio - miny * scaley;
		console.log(pathX)
		console.log(minx, miny)
		console.log(shiftx, shifty)

		// u.ctx.beginPath();
		// u.ctx.strokeStyle = 'white';
		// u.ctx.moveTo(left, top);
		// u.ctx.lineTo(left + width, top + height);
		// u.ctx.stroke();

		const p = new Path2D();
		// p.lineTo(left, top)
		// p.lineTo(left + width, top+height)
		const deg360 = 2 * Math.PI;
		// FIXME: gaps
		for (let i = 0; i < dataX.length; i++) {
			// const cx = valToPosX(dataX[i], scaleX, xDim, xOff);
			// const cy = valToPosY(val, scaleY, yDim, yOff);
			const ax = pathX[i] * scalex + shiftx;
			const ay = pathY[i] * scaley + shifty;
			p.lineTo(ax, ay);
		}
		return { stroke: p };
	};
}