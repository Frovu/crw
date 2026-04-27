import uPlot from 'uplot';

export function linePaths(width = 1): uPlot.Series.PathBuilder {
	return (u, seriesIdx) => {
		uPlot.orient(u, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim) => {
			const d = u.data[seriesIdx] as any;
			const ss = u.ctx.strokeStyle;
			const ww = u.ctx.lineWidth;
			u.ctx.strokeStyle = (series.stroke as any)();
			u.ctx.lineWidth = width * devicePixelRatio;
			const p = new Path2D();
			for (let i = 0; i < d[0].length; i++) {
				const xVal = d[0][i];
				const yVal = d[1][i];
				if (xVal >= scaleX.min! && xVal <= scaleX.max! && yVal >= scaleY.min! && yVal <= scaleY.max!) {
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
