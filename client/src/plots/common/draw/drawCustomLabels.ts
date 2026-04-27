import type uPlot from 'uplot';
import { clamp } from '../../../util';
import { parseText, applyTextTransform, measureStyled, applyStyles } from '../basicPlot';
import { applyOverrides, withOverrides, color, measureDigit, scaled } from '../plotUtil';
import type { CustomAxis } from '../types';

export function drawCustomLabels({ params: { showLegend } }: { params: { showLegend: boolean } }) {
	const captureOverrides = applyOverrides;
	return (u: uPlot) =>
		withOverrides(() => {
			for (const axis of u.axes as CustomAxis[]) {
				if (!axis.show || !axis.fullLabel) continue;

				const isHorizontal = axis.side && axis.side % 2 === 0;

				const marked: { [k: string]: true } = {};
				const rec = (txt: string = axis.fullLabel!): string[][] => {
					if (!txt) return [];
					const re = (label: string) =>
						new RegExp(`(?<!(?:d|e)\\()${label.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&')}(?![_a-z])`);
					const series = u.series.find(
						(ser) => ser && !marked[ser.label as string] && ser.label && txt.match(re(ser.label as string)),
					);
					if (!series) return [[txt, color('text')]];
					const label = series.label as string;
					marked[label] = true;
					const split = txt.slice().split(re(label));
					const stroke = typeof series.stroke === 'function' ? series.stroke(u, 0) : series.stroke; // FIXME: seriesIdx
					return [...rec(split[0]), [label, stroke as string], ...rec(split[1])];
				};

				const parts = showLegend
					? parseText(applyTextTransform(axis.fullLabel)).map((n) => ({ ...n, stroke: color('text') }))
					: rec().flatMap(([text, stroke]) => {
							const nodes = parseText(applyTextTransform(text));
							return nodes.map((n) => ({ ...n, stroke }));
						});

				const fontSize = measureDigit();
				const textWidth = measureStyled(u.ctx, parts);
				const px = (a: number) => scaled(a * devicePixelRatio);

				const flowDir = isHorizontal || axis.side === 3 ? 1 : -1;
				const baseTop = (flowDir > 0 ? 0 : u.width) + (axis.labelSize ?? fontSize.height) * flowDir;
				const first = axis._splits?.[axis._values?.findIndex((v) => !!v || (v as any) === 0)!]!;
				const last = axis._splits?.[axis._values?.findLastIndex((v) => !!v || (v as any) === 0)!]!;
				const targetLeft =
					(axis.distr === 3
						? !isHorizontal
							? u.bbox.top + u.bbox.height / 2
							: u.bbox.left + u.bbox.width / 2
						: u.valToPos((last + first) / 2, axis.scale!, true)) +
					(flowDir * textWidth) / 2;

				let posX, posY;
				if (isHorizontal) {
					posX = clamp(px(2), u.width * devicePixelRatio - textWidth - px(4), targetLeft - textWidth);
					posY = axis.side === 0 ? (axis.labelSize ?? fontSize.height) : u.height * devicePixelRatio - px(2);
				} else {
					const bottomX = u.height * devicePixelRatio;
					posX = Math.round(baseTop + axis.labelGap! * -flowDir) * devicePixelRatio;
					posY =
						flowDir > 0
							? clamp(textWidth + px(4), bottomX - px(2), targetLeft, true)
							: clamp(px(2), bottomX - textWidth - px(4), targetLeft);
					if (isNaN(posY)) continue;
				}

				u.ctx.save();
				u.ctx.translate(posX, posY);
				if (!isHorizontal) u.ctx.rotate((axis.side === 3 ? -Math.PI : Math.PI) / 2);
				u.ctx.textBaseline = 'bottom';
				u.ctx.textAlign = 'left';
				let x = 0;
				for (const { text, stroke, styles } of parts) {
					u.ctx.save();
					applyStyles(u.ctx, styles);
					u.ctx.fillStyle = stroke;
					u.ctx.fillText(text, x, 0);
					x += u.ctx.measureText(text).width;
					u.ctx.restore();
				}
				u.ctx.restore();
			}
		}, captureOverrides);
}
