import { color, type Color } from '../../app/app';
import { clamp, dispatchCustomEvent } from '../../util';
import { applyTextTransform, measureStyled, applyStyles } from './basicPlot';
import { drawCustomLabels } from './draw/drawCustomLabels';
import { drawCustomLegend } from './draw/drawCustomLegend';
import { getFontSize, scaled, withCapturedOverrides } from './plotUtil';
import { drawMagneticClouds } from './draw/drawMagneticClouds';
import { drawOnsets } from './draw/drawOnsets';
import type { BasicPlotParams, CustomScale, TextNode } from './types';

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

export function metainfoPlugin({
	params,
	truncate,
	under,
}: {
	params: BasicPlotParams;
	truncate?: (u: Omit<uPlot, 'scales'> & { scales: { [k: string]: CustomScale } }) => number;
	under?: boolean;
}): uPlot.Plugin {
	return {
		hooks: {
			drawAxes: [drawMagneticClouds(params, truncate)].concat(under ? drawOnsets(params, truncate) : []),
			draw: under ? [] : [drawOnsets(params, truncate)],
		},
	};
}

export function legendPlugin(para: Parameters<typeof drawCustomLegend>[0]): uPlot.Plugin {
	return {
		hooks: {
			ready: [para.overlayHandle.onReady],
			draw: [drawCustomLegend(para)],
		},
	};
}

export function labelsPlugin(para: Parameters<typeof drawCustomLabels>[0]): uPlot.Plugin {
	return {
		hooks: {
			draw: [drawCustomLabels(para)],
		},
	};
}

export function actionsPlugin(): uPlot.Plugin {
	return {
		hooks: {
			ready: [
				(u) => {
					u.over.addEventListener('mousedown', (e) => {
						if (e.button !== 0) return;
						if (u.cursor?.left) dispatchCustomEvent('plotClick', { timestamp: u.posToVal(u.cursor.left, 'x') });
					});
				},
			],
		},
	};
}
