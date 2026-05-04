import uPlot from 'uplot';
import { applyTextTransform } from './basicPlot';
import * as APP from '../../app/app';
import type { TextTransform } from '../../api';
import type { ScaleParams, BasicPlotParams } from './types';

export const color = APP.color;

export type PlotsOverrides = {
	scale: number;
	fontSize: number;
	fontFamily?: string;
	scalesParams?: { [key: string]: ScaleParams };
	textTransform?: TextTransform[];
};

const defaultPlotsState: PlotsOverrides = {
	scale: 1,
	fontSize: 14,
};

export let applyOverrides: Partial<PlotsOverrides> | null = null;
export const withOverrides = <T>(foo: () => T, overrides?: null | Partial<PlotsOverrides>): T => {
	applyOverrides = overrides ?? null;
	const res = foo();
	applyOverrides = null;
	return res;
};

export const withCapturedOverrides = <A extends any[], R>(foo: (...args: A) => R) => {
	const capturedOverrides = applyOverrides;
	return (...args: A) => withOverrides(() => foo(...args), capturedOverrides);
};

const poorCanvasCtx = document.createElement('canvas').getContext('2d')!;

export const measureDigit = () => {
	const height = getFontSize();
	poorCanvasCtx.font = font();
	const { width } = poorCanvasCtx.measureText('8');
	return { width, height };
};

export const getParam = <T extends keyof PlotsOverrides>(k: T) => {
	return applyOverrides?.[k] ?? defaultPlotsState[k];
};

export const scaled = (a: number) => a * getParam('scale');
export const getFontSize = () => Math.round(scaled(getParam('fontSize')));

export function font(sz: number | null = null, scale: boolean = false, style: string = '') {
	const family = window.getComputedStyle(document.body).font.split('px').at(-1);
	const sclSize = scaled(sz ?? getParam('fontSize'));
	const size = Math.round(scale ? sclSize * devicePixelRatio : sclSize);
	const famOv = getParam('fontFamily');
	return `${style} ${size}px ${famOv ? famOv + ', ' : ''} ${family}`;
}

export function superScript(num: number) {
	const d = Math.abs(num);
	const min = num < 0 ? '⁻' : '';
	return min + ['⁰', '¹', '² ', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'][d];
}

export function axisDefaults(grid: boolean, filter?: uPlot.Axis.Filter): uPlot.Axis {
	const scl = getParam('scale');
	const { width, height } = measureDigit();
	return {
		font: font(),
		labelFont: font(),
		stroke: color('text'),
		labelSize: height + scl * 1 + 1,
		labelGap: 0,
		space: height * 1.75,
		size: width * 3 + scl * 10,
		gap: scl,
		grid: { show: grid ?? true, stroke: color('grid'), width: scl * 2, ...(filter && { filter }) },
		ticks: { size: scl * 8, stroke: color('grid'), width: scl * 2, ...(filter && { filter }) },
		...(filter && { filter }),
	};
}

export function seriesDefaults(name: string, colour: (typeof APP.colorKeys)[number], scale?: string) {
	return {
		width: scaled(1),
		scale: scale ?? name,
		label: name,
		stroke: color(colour),
		points: { fill: color('bg'), stroke: color(colour) },
	} as uPlot.Series;
}

export function customTimeSplits(params?: BasicPlotParams): Partial<uPlot.Axis> {
	const { height, width } = measureDigit();
	const show = !params || params?.showTimeAxis;
	const captureOverrides = applyOverrides;
	return {
		splits: (u, ax, min, max, incr, space) => {
			const num = Math.floor(u.width / space);
			const w = Math.ceil((max - min) / num);
			const split = ([4, 6, 12, 24, 48, 96, 120, 144, 240, 360, 720].find((s) => w <= s * 3600) || 1440) * 3600;
			const start = Math.ceil(min / split) * split;
			const limit = Math.ceil((max - split / 4 - start) / split);
			return Array(limit)
				.fill(1)
				.map((a, i) => start + i * split);
		},
		values: (u, splits) =>
			withOverrides(
				() =>
					splits.map((v) => {
						const w = Math.ceil(((splits.at(-1) ?? 0) - splits[0]) / 3600);
						if (!show || v % ((w > 40 ? 24 : 12) * 3600) !== 0) return null;
						const d = new Date(v * 1e3);
						if (v % 86400 !== 0) return applyTextTransform('  ' + d.toISOString().slice(11, 16));
						const month = String(d.getUTCMonth() + 1).padStart(2, '0');
						const day = String(d.getUTCDate()).padStart(2, '0');
						const showYear = v - splits[0] < 86400 && String(d.getUTCFullYear());
						const text = (showYear ? showYear + '-' : '     ') + month + '-' + day;
						return applyTextTransform(text);
					}),
				captureOverrides,
			),
		space: width * 5.5,
		gap: scaled(1),
		ticks: {
			show,
			size: scaled(6),
			width: scaled(2),
			stroke: color('grid'),
			filter: (u, splits) => splits.map((s) => (s % (6 * 3600) === 0 ? s : null)),
		},
		...(!show && { ticks: { show: false } }),
		size: show ? height + scaled(6) + 1 : 0,
	};
}
