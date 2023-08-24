import uPlot from 'uplot';
import { color, drawShape, drawArrow } from './plotUtil';

export function circlePaths(callback, minMaxMagn, linear=false) {
	return (u, seriesIdx) => {
		uPlot.orient(u, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim) => {
			const strokeWidth = 1.5;
			const deg360 = 2 * Math.PI;
			const d = u.data[seriesIdx];

			const maxSize = Math.min(120, 16 + u.height / 8);
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
				let size = linear ?
					Math.max(2, (Math.abs(d[2][i]) / maxMagn * maxSize)) * devicePixelRatio :
					Math.max(2, maxSize / (minMaxMagn / 2.2)* Math.log(Math.abs(d[2][i]) + 1) - 6) * devicePixelRatio;
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
	let xpos = null, ypos = null;
	let xposClick = xpos, yposClick = ypos;
	let clickx = 0, clicky = 0, drag = false;
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

		u.ctx.save();
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
				const a0y = u.valToPos(u.data[2][i], 'a0', true);
				u.ctx.moveTo(x, y);
				u.ctx.lineTo(a0x, a0y);
			}
		}
		u.ctx.stroke();

		u.ctx.beginPath();
		u.ctx.strokeStyle = u.series[seriesIdx].stroke();
		u.ctx.fillStyle = u.ctx.strokeStyle;
		u.ctx.lineWidth = 2;
		x = xpos = xpos ?? 22;
		y = ypos = ypos ?? 40;
		u.ctx.lineWidth = 2;
		u.ctx.rect(x, y, 8, 8);
		const xarrow = Math.floor(64 / scalex);
		const yarrow = Math.floor(64 / scaley);
		const legendWidth = xarrow * scalex + 12, legendHeight = yarrow * scaley + 4;
		u.ctx.moveTo(x, y + 12);
		drawArrow(u.ctx, 0, yarrow * scaley, x, y + yarrow * scaley);
		u.ctx.moveTo(x + 12, y);
		drawArrow(u.ctx, xarrow * scalex, 0, x + xarrow * scalex, y);

		u.ctx.fillText(`Ax, ${yarrow}%`, x + 8, y + yarrow * scaley - 16);
		u.ctx.fillText(`Ay, ${xarrow}%`, x + xarrow * scalex - 40, y - 16);
		u.ctx.stroke();

		u.over.parentElement.onmousemove = e => {
			if (!drag) return;
			const dx = e.clientX - u.rect.left + u.bbox.left - clickx;
			const dy = e.clientY - u.rect.top + u.bbox.top - clicky;
			xpos = Math.max(12, Math.min(xposClick + dx, -8 + u.rect.width + u.bbox.left));
			ypos = Math.max(30, Math.min(yposClick + dy, 12 + u.bbox.height - legendHeight));
			u.redraw();
		};
		u.over.parentElement.onmousedown = e => {
			clickx = e.clientX - u.rect.left + u.bbox.left;
			clicky = e.clientY - u.rect.top + u.bbox.top;
			if (clickx > xpos && clickx < xpos + legendWidth && clicky > ypos - 24 && clicky < ypos + legendHeight) {
				xposClick = xpos;
				yposClick = ypos;
				drag = true;
			}
		};
		u.over.parentElement.onmouseup = u.over.parentElement.onmouseleave = e => {
			drag = false;
		};

		u.ctx.restore();

		return { stroke: p };
	};
}