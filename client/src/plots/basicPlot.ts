import type { MagneticCloud, Onset } from '../events/core/plot';
import type { EventsSettings } from '../events/core/util';
import { clamp, apiGet, prettyDate, dispatchCustomEvent } from '../util';
import {
	getParam,
	font,
	scaled,
	type Shape,
	applyOverrides,
	withOverrides,
	getFontSize,
	drawShape,
	measureDigit,
	color,
	drawMagneticClouds,
	drawOnsets,
	type PlotOverlayHandle,
} from './plotUtil';
import type uPlot from 'uplot';

export type TextTransform = {
	search: string;
	replace: string;
};
export type ScaleParams = {
	min: number;
	max: number;
	bottom: number;
	top: number;
};
export type BasicPlotParams = {
	interval: [Date, Date];
	onsets?: Onset[];
	ends?: Onset[];
	clouds?: MagneticCloud[];
	interactive?: boolean;
	stretch?: boolean;
	showTimeAxis: boolean;
	showEventsEnds: boolean;
	showMetaLabels: boolean;
	showMetaInfo: boolean;
	showGrid: boolean;
	showMarkers: boolean;
	showLegend: boolean;
};

export const defaultPlotParams: Omit<BasicPlotParams, keyof EventsSettings | 'interval'> = {
	showMetaInfo: true,
	showMetaLabels: true,
	showTimeAxis: true,
};

export type CustomAxis = uPlot.Axis & {
	label: string;
	fullLabel?: string;
	position?: [number, number];
	minMax?: [number | null, number | null];
	showGrid?: boolean;
	whole?: boolean;
	distr?: number;
	_values?: (string | undefined)[];
	_splits?: number[];
};
export type CustomSeries = uPlot.Series & {
	legend?: string;
	marker?: Shape;
	bars?: boolean;
	myPaths?: (scl: number) => uPlot.Series['paths'];
};
export type CustomScale = uPlot.Scale & {
	scaleValue?: { min: number; max: number };
	positionValue?: { bottom: number; top: number };
};

export const applyTextTransform = (text: string) => {
	return (
		getParam('textTransform')?.reduce((txt, { search, replace }) => {
			try {
				return txt.replace(new RegExp(search, 'ug'), replace);
			} catch (e) {
				return txt;
			}
		}, text) ?? text
	);
};

const styleTags = { b: 'bold', i: 'italic', sup: 'super', sub: 'sub' } as const;
type TextNode = {
	text: string;
	styles: (typeof styleTags)[keyof typeof styleTags][];
};
export const parseText = (txt: string) => {
	const style = (a: keyof typeof styleTags) => styleTags[a];
	const split = (t: string, spl: string) =>
		t
			.split(new RegExp(`${spl}(.*)`))
			.concat('')
			.slice(0, 2);
	const rec = (node: TextNode): TextNode[] => {
		const { text, styles } = node;
		if (!text) return [];
		const tagName = text.match(`<(${Object.keys(styleTags).join('|')})>`)?.[1] as keyof typeof styleTags;
		if (!tagName) return [node];
		const tag = `<${tagName}>`,
			closing = `</${tagName}>`;
		const [before, after] = split(text, tag);
		const [inside, outside] = split(after, closing);
		return [
			...rec({ text: before, styles }),
			...rec({ text: inside, styles: styles.concat(style(tagName)) }),
			...rec({ text: outside, styles }),
		];
	};
	return rec({ text: txt, styles: [] });
};

export const applyStyles = (ctx: CanvasRenderingContext2D, styles: TextNode['styles']) => {
	const style = (styles.includes('italic') ? 'italic' : '') + (styles.includes('bold') ? ' bold' : '');
	const fSize = getParam('fontSize');
	const size = styles.includes('super') || styles.includes('sub') ? Math.ceil((fSize * 3) / 4) : null;
	ctx.font = font(size, true, style);
	if (styles.includes('sub')) ctx.translate(0, scaled(fSize / 8));
	if (styles.includes('super')) ctx.translate(0, -scaled(fSize / 3));
};

export const measureStyled = (ctx: CanvasRenderingContext2D, parts: TextNode[]) => {
	const textWidth = parts.reduce((a, { text, styles }) => {
		ctx.save();
		applyStyles(ctx, styles);
		const ww = ctx.measureText(text).width + ctx.getTransform().e;
		ctx.restore();
		return a + ww;
	}, 0);
	return textWidth;
};

export function drawCustomLegend({
	params,
	overlayHandle: { size, position, defaultPos },
}: {
	params: { showLegend: boolean };
	overlayHandle: PlotOverlayHandle;
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
					series.map(({ legend }) => measureStyled(u.ctx, legend))
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
				const mrkr = bars ? marker ?? 'square' : marker;
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
						(ser) => ser && !marked[ser.label as string] && txt.match(re(ser.label as string))
					);
					if (!series) return [[txt, color('text')]];
					const label = series.label as string;
					marked[label] = true;
					const split = txt.slice().split(re(label));
					const stroke = typeof series.stroke === 'function' ? series.stroke(u, 0) : series.stroke; // FIXME: seriesIdx
					return [...rec(split[0]), [label, stroke as string], ...rec(split[1])];
				};

				const parts = showLegend
					? parseText(applyTextTransform(axis.fullLabel!)).map((n) => ({ ...n, stroke: color('text') }))
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
					(axis.distr === 3 ? u.bbox.top + u.bbox.height / 2 : u.valToPos((last + first) / 2, axis.scale!, true)) +
					(flowDir * textWidth) / 2;

				let posX, posY;
				if (isHorizontal) {
					posX = clamp(px(2), u.width * devicePixelRatio - textWidth - px(4), targetLeft - textWidth);
					posY = axis.side === 0 ? axis.labelSize ?? fontSize.height : u.height * devicePixelRatio - px(2);
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

export function paddedInterval(interv: [Date, Date]) {
	return [Math.floor(interv[0].getTime() / 864e5) * 86400, Math.ceil((interv[1].getTime() + 36e5) / 864e5) * 86400];
}

export function sliceData(data: (number | null)[][], interval: [Date, Date]) {
	const sliceLft = data[0].findIndex((t) => t != null && t >= interval[0].getTime() / 1000);
	const sliceRgt = data[0].findLastIndex((t) => t != null && t <= interval[1].getTime() / 1000);
	return data.map((col) => col.slice(sliceLft, sliceRgt));
}

export async function basicDataQuery(path: string, interval: [Date, Date], query: string[], params?: {}) {
	const interv = paddedInterval(interval);
	const body = await apiGet<{ rows: (number | null)[][]; fields: string[] }>(path, {
		from: interv[0].toFixed(0),
		to: interv[1].toFixed(0),
		query: query.join(),
		...params,
	});
	if (!body?.fields.length) return null;
	const fieldsIdxs = query.map((f) => body.fields.indexOf(f));
	const ordered = fieldsIdxs.map((i) => body.rows.map((row) => row[i]));
	console.log(path, '=>', ordered, query);
	const timeIdx = query.indexOf('time');
	const period = timeIdx >= 0 && ordered[timeIdx].length > 1 && ordered[timeIdx][1]! - ordered[timeIdx][0]!;
	if (period)
		ordered.splice(
			timeIdx,
			1,
			ordered[timeIdx].map((t) => (t == null ? null : t + period / 2))
		);
	return ordered;
}

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

		const left = tooltipLeftOffset + lft + shiftX * (flip ? -1 : 1);
		tooltip.style.top = tooltipTopOffset + top + shiftY + 'px';
		tooltip.style.left =
			(flip ? Math.max(left, tooltip.clientWidth) : Math.min(left, u.width - tooltip.clientWidth)) + 'px';
		tooltip.style.transform = flip ? 'translateX(-100%)' : 'unset';
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
					const idx = userDidx ? userDidx() : u.cursor.idxs?.[seriesIdx!] ?? null;
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
	text: { text: string; styles?: TextNode['styles']; color: string }[];
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
