import type uPlot from 'uplot';
import { scaled, color, withCapturedOverrides } from '../plotUtil';
import type { BasicPlotParams } from '../types';

export function drawMagneticClouds(params: BasicPlotParams, truncateY?: (u: uPlot) => number) {
	return withCapturedOverrides((u: uPlot) => {
		if (!params.showMetaInfo || !params.clouds?.length) return;
		const patternCanvas = document.createElement('canvas');
		const ctx = patternCanvas.getContext('2d')!;
		const scale = scaled(devicePixelRatio);
		patternCanvas.height = patternCanvas.width = 16 * scale;
		ctx.fillStyle = color('area2');

		ctx.scale(scale, scale);
		ctx.moveTo(0, 6);
		ctx.lineTo(10, 16);
		ctx.lineTo(16, 16);
		ctx.lineTo(0, 0);
		ctx.moveTo(16, 0);
		ctx.lineTo(16, 6);
		ctx.lineTo(10, 0);
		ctx.fill();

		for (const cloud of params.clouds) {
			const startX = Math.max(u.bbox.left - scaled(4), u.valToPos(cloud.start.getTime() / 1e3, 'x', true));
			const endX = Math.min(u.bbox.width + u.bbox.left + scaled(4), u.valToPos(cloud.end.getTime() / 1e3, 'x', true));
			if (endX <= startX) continue;
			u.ctx.save();
			u.ctx.beginPath();
			u.ctx.fillStyle = u.ctx.createPattern(patternCanvas, 'repeat')!;
			const h = u.bbox.top + u.bbox.height - 2,
				fromY = truncateY?.(u) ?? 2;
			u.ctx.fillRect(startX, fromY, endX - startX, truncateY?.(u) ? h - truncateY(u) : h);
			u.ctx.fill();
			u.ctx.restore();
		}
	});
}
