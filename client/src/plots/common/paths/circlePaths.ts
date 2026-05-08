import uPlot from 'uplot';
import { clamp } from '../../../util';
import { scaled } from '../plotUtil';
import type { CirclesPlotParams } from '../../time/CirclesPlot';

export function circlesSizeComputer(u: uPlot, params: CirclesPlotParams, data: any, minMaxMagn: number) {
	const maxSize = u.height / 10 + (params.sizeShift ?? 0);
	const maxMagn = Math.max(minMaxMagn, Math.max.apply(null, data.map(Math.abs)));
	return (v: number) => {
		const sz = params.linearSize
			? (Math.abs(v) / maxMagn) * maxSize
			: (maxSize * (10 - Math.pow((Math.abs(v) + 38.7) / 50, -9))) / 10;
		return Math.max(scaled(1.5), sz) * devicePixelRatio;
	};
}

export function circlePaths(
	minMaxMagn: number,
	params: CirclesPlotParams,
	rectCallback?: (a: any) => void,
): uPlot.Series.PathBuilder {
	const strokeWidth = clamp(1.5, 8, scaled(devicePixelRatio) / 1.5);
	return (u, seriesIdx) => {
		uPlot.orient(u, seriesIdx, (series, dataX, datapeY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim) => {
			const deg360 = 2 * Math.PI;
			const d = u.data[seriesIdx] as unknown as number[][];

			const maxSize = u.height / 10 + (params.sizeShift ?? 0);
			const sizeComp = circlesSizeComputer(u, params, d[2], minMaxMagn);

			u.ctx.save();
			u.ctx.beginPath();
			u.ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
			u.ctx.clip();
			u.ctx.fillStyle = (series.fill as any)();
			u.ctx.strokeStyle = (series.stroke as any)();
			u.ctx.lineWidth = strokeWidth;

			const filtLft = u.posToVal(-maxSize / 2, scaleX.key!);
			const filtRgt = u.posToVal(u.bbox.width / devicePixelRatio + maxSize / 2, scaleX.key!);
			const filtBtm = u.posToVal(u.bbox.height / devicePixelRatio + maxSize / 2, scaleY.key!);
			const filtTop = u.posToVal(-maxSize / 2, scaleY.key!);

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
					rectCallback?.({
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
