import type uPlot from 'uplot';
import { parseText, applyTextTransform, measureStyled, applyStyles } from '../basicPlot';
import type { usePlotOverlay } from '../plotOverlay';
import { applyOverrides, withOverrides, scaled, getFontSize, color } from '../plotUtil';
import type { CustomSeries } from '../types';
import { drawShape } from '../paths/markersPaths';

export function drawCustomLegend({
	params,
	overlayHandle: { size, position, defaultPos },
}: {
	params: { showLegend: boolean };
	overlayHandle: ReturnType<typeof usePlotOverlay>;
}) {
	const captureOverrides = applyOverrides;
	return (u: Omit<uPlot, 'series'> & { series: CustomSeries[] }) =>
		withOverrides(() => {
			if (!params.showLegend) return;
			const series = u.series
				.filter((s) => s && s.show! && s.legend)
				.map((s) => ({ ...s, legend: parseText(applyTextTransform(' ' + s.legend!).trim()) }));
			if (!series.length) return;

			const allBars = series.every((s) => s.bars);

			const px = (a: number) => scaled(a * devicePixelRatio);

			const makrerWidth = allBars ? 12 : 24;
			const width =
				px(makrerWidth + 16) +
				Math.max.apply(
					null,
					series.map(({ legend }) => measureStyled(u.ctx, legend)),
				);
			const lineHeight = getFontSize() * devicePixelRatio + px(2);
			const height = series.length * lineHeight + px(4);
			if (!captureOverrides?.scale) size.current = { width, height };

			const pos = position.current ?? defaultPos(u, size.current);

			const x = scaled(pos.x);
			let y = scaled(pos.y);
			u.ctx.save();
			u.ctx.lineWidth = px(1);
			u.ctx.strokeStyle = color('dark');
			u.ctx.fillStyle = color('bg');
			u.ctx.fillRect(x, y, width, height);
			u.ctx.strokeRect(x, y, width, height);
			u.ctx.textAlign = 'left';
			u.ctx.lineCap = 'butt';
			y += lineHeight / 2 + px(3);
			const draw = drawShape(u.ctx, px(6));
			for (const { stroke, marker, legend, bars } of series) {
				u.ctx.lineWidth = px(2);
				u.ctx.fillStyle = u.ctx.strokeStyle = (stroke as any)();
				u.ctx.beginPath();
				if (!bars) {
					u.ctx.moveTo(x + px(6), y);
					u.ctx.lineTo(x + px(6 + makrerWidth), y);
					u.ctx.stroke();
				}
				u.ctx.lineWidth = marker === 'arrow' ? px(2) : px(1);
				const mrkr = bars ? (marker ?? 'square') : marker;
				if (mrkr) draw[mrkr](x + px(6 + makrerWidth / 2), y);
				if (mrkr !== 'arrow') u.ctx.fill();
				u.ctx.fillStyle = color('text');
				let textX = x + px(makrerWidth + 12);
				for (const { text, styles } of legend) {
					u.ctx.save();
					applyStyles(u.ctx, styles);
					u.ctx.fillText(text, textX, y);
					textX += u.ctx.measureText(text).width;
					u.ctx.restore();
				}
				u.ctx.stroke();
				y += lineHeight;
			}
			u.ctx.restore();
		}, captureOverrides);
}
