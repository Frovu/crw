import { type Color, color } from '../../../app/app';
import { clamp } from '../../../util';
import { applyTextTransform, measureStyled, applyStyles } from '../basicPlot';
import { getFontSize, scaled, withCapturedOverrides } from '../plotUtil';
import type { TextNode } from '../types';

export function titlePlugin({
	text: textParts,
	params: { showTitle },
}: {
	text: { text: string; styles?: TextNode['styles']; color: Color }[];
	params: { showTitle: boolean };
}): uPlot.Plugin {
	const pad = getFontSize() + scaled(2);
	return {
		opts: (u, opts) =>
			!showTitle
				? opts
				: {
						...opts,
						padding: opts.padding?.toSpliced(0, 1, (opts.padding as any)[0] + pad) as any,
					},
		hooks: !showTitle
			? {}
			: {
					ready: [
						(u) => {
							u.root.addEventListener('click', (e) => {
								const rect = u.root.getBoundingClientRect();
								if (e.clientY - rect.y < 32) {
									const fulltext = textParts.reduce((txt, { text }) => txt + text, '');
									navigator.clipboard.writeText(fulltext);
									const div = document.createElement('div');
									div.style.position = 'fixed';
									div.style.color = color('white');
									div.style.background = color('bg', 0.5);
									div.style.cursor = 'unset';
									div.style.userSelect = 'none';
									div.style.top = e.clientY - 16 + 'px';
									div.style.left = e.clientX + 'px';
									div.innerText = 'Title copied!';

									document.body.appendChild(div);
									setTimeout(() => document.body.removeChild(div), 500);
								}
							});
						},
					],
					drawClear: [
						withCapturedOverrides((u) => {
							u.ctx.save();
							u.ctx.textAlign = 'left';
							u.ctx.textBaseline = 'top';
							const parts = textParts.map((t) => ({
								...t,
								styles: t.styles ?? [],
								text: applyTextTransform(t.text),
							}));
							const width = measureStyled(u.ctx, parts);
							let x = clamp(4, u.width * devicePixelRatio - width, (u.width * devicePixelRatio - width) / 2);
							for (const { text, styles, color: c } of parts) {
								u.ctx.save();
								applyStyles(u.ctx, styles);
								u.ctx.fillStyle = color(c);
								u.ctx.fillText(text, x, scaled(4));
								x += u.ctx.measureText(text).width;
								u.ctx.restore();
							}
							u.ctx.restore();
						}),
					],
				},
	};
}
