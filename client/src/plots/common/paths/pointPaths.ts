import uPlot from 'uplot';

export function pointPaths(sizePx: number, rectCallback?: any): uPlot.Series.PathBuilder {
	return (u, seriesIdx) => {
		const size = sizePx * devicePixelRatio;
		uPlot.orient(
			u,
			seriesIdx,
			(series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim, moveTo, lineTo, rect, arc) => {
				const d = u.data[seriesIdx] as any;
				u.ctx.fillStyle = (series.stroke as any)();
				const deg360 = 2 * Math.PI;
				const p = new Path2D();
				for (let i = 0; i < d[0].length; i++) {
					const xVal = d[0][i];
					const yVal = d[1][i];
					if (xVal >= scaleX.min! && xVal <= scaleX.max! && yVal >= scaleY.min! && yVal <= scaleY.max!) {
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
			},
		);
		return null;
	};
}
