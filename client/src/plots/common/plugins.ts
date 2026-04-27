import { color, type Color } from '../../app/app';
import { prettyDate, clamp, dispatchCustomEvent } from '../../util';
import { applyTextTransform, measureStyled, applyStyles } from './basicPlot';
import { drawCustomLabels } from './draw/drawCustomLabels';
import { drawCustomLegend } from './draw/drawCustomLegend';
import { getFontSize, scaled, applyOverrides, withOverrides } from './plotUtil';
import { drawMagneticClouds } from './draw/drawMagneticClouds';
import { drawOnsets } from './draw/drawOnsets';
import type { BasicPlotParams, CustomScale, TextNode } from './types';

export function tooltipPlugin({
	html,
	sidx: userSidx,
	didx: userDidx,
	onclick,
}: {
	didx?: () => number;
	sidx?: (u: uPlot, sidx: number) => number;
	onclick?: (u: uPlot, dIdx: number) => void;
	html?: (u: uPlot, sIdx: number, dIdx: number) => string;
} = {}): uPlot.Plugin {
	const shiftX = 4;
	const shiftY = 4;
	let tooltipLeftOffset = 0;
	let tooltipTopOffset = 0;
	let seriesIdx: number | null = 1;
	let dataIdx: number | null = 1;

	const isHidden = (u: uPlot, si: number) => ['Value'].includes(u.series[si]?.label as string);

	function setTooltip(u: uPlot) {
		const show = seriesIdx != null && dataIdx != null && !isHidden(u, seriesIdx);

		tooltip.style.display = show ? 'block' : 'none';
		u.over.style.cursor = onclick ? 'pointer' : 'crosshair';

		if (!show) return;
		const sidx = userSidx ? userSidx(u, seriesIdx!) : seriesIdx!;
		const series = u.series[sidx];

		const isScatter = (u as any).mode === 2;
		const stroke = typeof series.stroke == 'function' ? series.stroke(u, sidx) : series.stroke;
		const val = isScatter ? (u.data as any)[sidx][1][dataIdx!] : (u.data[sidx][dataIdx!] as number);
		const valst = Math.abs(val) >= 0.01 ? (Math.round(val * 100) / 100).toString() : val.toExponential();
		const xval = isScatter ? (u.data as any)[0][0][dataIdx!] : u.data[0][dataIdx!];

		const top = u.valToPos(val, series.scale ?? 'y');
		const lft = u.valToPos(xval, 'x');
		const flip = tooltipLeftOffset + lft + tooltip.clientWidth + 10 >= u.width;
		const flipY = tooltipTopOffset + top + tooltip.clientHeight + 5 >= u.height;

		const left = tooltipLeftOffset + lft + shiftX * (flip ? -1 : 1);
		tooltip.style.top = tooltipTopOffset + top + shiftY + 'px';
		tooltip.style.left =
			(flip ? Math.max(left, tooltip.clientWidth) : Math.min(left, u.width - tooltip.clientWidth)) + 'px';
		tooltip.style.transform =
			flip && flipY ? 'translate(-100%,-100%)' : flip ? 'translateX(-100%)' : flipY ? 'translateY(-100%)' : 'unset';
		const xlbl = u.scales.x.time ? prettyDate(xval) : xval.toString();
		tooltip.innerHTML = html
			? html(u, sidx, dataIdx!)
			: `${xlbl}, <span style="color: ${stroke};">${series.label}</span> = ${valst}`;
	}

	const tooltip = document.createElement('div');
	tooltip.className = 'u-tooltip';

	return {
		opts: (_, opts) => ({
			...opts,
			legend: { show: false },
			cursor: {
				drag: { x: false, y: false, setScale: false },
				...opts.cursor,
				focus: {
					prox: 32,
					dist: (u, sidx, didx, valPos, curPos) => {
						if (isHidden(u, sidx)) return Infinity;
						return curPos - valPos;
					},
					...opts.cursor?.focus,
				},
				points: {
					width: 2,
					size: 8,
					stroke: (u, sidx) => (isHidden(u, sidx) ? 'transparent' : color('white')),
					fill: 'transparent',
					...opts.cursor?.points,
				},
			},
		}),
		hooks: {
			ready: [
				(u) => {
					tooltipLeftOffset = parseFloat(u.over.style.left);
					tooltipTopOffset = parseFloat(u.over.style.top);
					u.root.querySelector('.u-wrap')!.appendChild(tooltip);
					u.setCursor({ left: -1, top: -1 });

					if (onclick) {
						let clientX: number;
						let clientY: number;

						u.over.addEventListener('mousedown', (e) => {
							clientX = e.clientX;
							clientY = e.clientY;
						});
						u.over.addEventListener('mouseup', (e) => {
							if (e.clientX === clientX && e.clientY === clientY) {
								if (dataIdx != null) onclick(u, dataIdx);
							}
						});
					}
				},
			],
			setCursor: [
				(u) => {
					const idx = userDidx ? userDidx() : (u.cursor.idxs?.[seriesIdx!] ?? null);
					if (dataIdx !== idx) {
						dataIdx = idx;
						setTooltip(u);
					}
				},
			],
			setSeries: [
				(u, sidx) => {
					if (seriesIdx !== sidx) {
						seriesIdx = sidx;
						setTooltip(u);
					}
				},
			],
		},
	};
}

export function titlePlugin({
	text: textParts,
	params: { showTitle },
}: {
	text: { text: string; styles?: TextNode['styles']; color: Color }[];
	params: { showTitle: boolean };
}): uPlot.Plugin {
	const pad = getFontSize() + scaled(2);
	const captureOverrides = { fontSize: 16, ...applyOverrides };
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
						(u) =>
							withOverrides(() => {
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
							}, captureOverrides),
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
