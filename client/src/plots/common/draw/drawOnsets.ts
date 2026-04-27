import type uPlot from 'uplot';
import { applyOverrides, withOverrides, measureDigit, color, font, scaled } from '../plotUtil';
import type { BasicPlotParams } from '../types';

export function drawOnsets(params: BasicPlotParams, truncateY?: (u: uPlot) => number) {
	const captureOverrides = applyOverrides;
	return (u: uPlot) =>
		withOverrides(() => {
			const { height } = measureDigit();
			if (!params.showMetaInfo || !params.onsets?.length) return;
			for (const { time, secondary, insert, type } of params.onsets) {
				const x = u.valToPos(time.getTime() / 1e3, 'x', true);
				if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) continue;
				const useColor = secondary ? color('text', 0.6) : insert ? color('active') : color('white');
				u.ctx.save();
				u.ctx.fillStyle = u.ctx.strokeStyle = useColor;
				u.ctx.font = font(null, true);
				u.ctx.textBaseline = 'bottom';
				u.ctx.textAlign = 'right';
				u.ctx.lineWidth = scaled(2 * devicePixelRatio);
				u.ctx.beginPath();
				const label = params.showMetaLabels;
				const minTop = 2 + (label ? height : 0);
				const lineY = Math.max(truncateY?.(u) ?? 0, minTop);
				u.ctx.moveTo(x, lineY);
				u.ctx.lineTo(x, u.bbox.top + u.bbox.height + scaled(4));
				label && u.ctx.fillText(insert ? 'Ins' : type || 'ons', x + scaled(2), lineY);
				u.ctx.stroke();
				u.ctx.restore();
			}

			if (!params.showEventsEnds && !params.ends?.find((e) => e.insert)) return;

			for (const { time, secondary, insert } of params.ends ?? []) {
				const x = u.valToPos(time.getTime() / 1e3, 'x', true) - scaled(1);
				if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) continue;
				const useColor = secondary ? color('text', 0.6) : insert ? color('active') : color('white');
				u.ctx.save();
				u.ctx.fillStyle = u.ctx.strokeStyle = useColor;
				u.ctx.lineWidth = scaled(2 * devicePixelRatio);
				u.ctx.beginPath();
				const len = scaled(secondary ? 12 : 16);
				const y = u.bbox.top + u.bbox.height + scaled(4);
				u.ctx.moveTo(x - len * (insert ? 3 : 2), y);
				u.ctx.lineTo(x, y);
				u.ctx.lineTo(x, y - len * (insert ? 3 : 1));
				u.ctx.stroke();
				u.ctx.restore();
			}
		}, captureOverrides);
}
