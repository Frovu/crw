import { apiGet } from '../../util';
import { font, getParam, scaled } from './plotUtil';
import { type Interval, type TextNode, textStyleTags } from './types';

export const applyTextTransform = (text: string) => {
	return (
		getParam('textTransform')?.reduce((txt, { search, replace }) => {
			try {
				return txt.replace(new RegExp(search, 'ug'), replace);
			} catch {
				return txt;
			}
		}, text) ?? text
	);
};

export const parseText = (txt: string) => {
	const style = (a: keyof typeof textStyleTags) => textStyleTags[a];
	const split = (t: string, spl: string) =>
		t
			.split(new RegExp(`${spl}(.*)`))
			.concat('')
			.slice(0, 2);
	const rec = (node: TextNode): TextNode[] => {
		const { text, styles } = node;
		if (!text) return [];
		const tagName = text.match(`<(${Object.keys(textStyleTags).join('|')})>`)?.[1] as keyof typeof textStyleTags;
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

export function paddedInterval(interv: Interval): Interval {
	return {
		start: Math.floor(interv.start / 86400) * 86400,
		end: Math.ceil((interv.end + 3600) / 86400) * 86400,
	};
}

export function sliceData(data: (number | null)[][], interval: Interval) {
	const sliceLft = data[0].findIndex((t) => t != null && t >= interval.start);
	const sliceRgt = data[0].findLastIndex((t) => t != null && t <= interval.end);
	return data.map((col) => col.slice(sliceLft, sliceRgt + 1));
}

export function basicDataQuery(path: string, query: string[], params?: object) {
	return async (interval: Interval) => {
		const body = await apiGet<{ rows: (number | null)[][]; fields: string[] }>(path, {
			from: interval.start.toFixed(0),
			to: interval.end.toFixed(0),
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
				ordered[timeIdx].map((t) => (t == null ? null : t + period / 2)),
			);
		return ordered;
	};
}
