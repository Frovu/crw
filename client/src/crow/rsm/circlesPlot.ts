import type { RSMPlotResponse } from '../../api';
import { circlesSizeComputer } from '../../plots/common/paths/circlePaths';
import type { usePlotOverlay } from '../../plots/common/plotOverlay';
import { applyOverrides, color, font, getFontSize, scaled, withCapturedOverrides } from '../../plots/common/plotUtil';
import type { BasicPlotParams, Interval } from '../../plots/common/types';
import type { CirclesPlotParams } from '../../plots/time/CirclesPlot';

export const [POS_S, NEG_S] = [6, 8];

export function renderCirclesData(resp: RSMPlotResponse, interval: Interval, shiftVariation?: number) {
	const sliceLft = resp.time.findIndex((t) => t != null && t >= interval.start);
	const sliceRgt = resp.time.findLastIndex((t) => t != null && t <= interval.end);
	const slen = resp.stations.length;
	const times = resp.time.slice(sliceLft, sliceRgt);
	const variations = resp.variations.map((sta) => sta.slice(sliceLft, sliceRgt));
	const tlen = times.length;
	if (tlen < 10) return;
	const data = Array.from(Array(4), () => new Array(slen * tlen));
	let posCount = 0,
		nullCount = 0;
	for (let ti = 0; ti < tlen; ++ti) {
		for (let si = 0; si < slen; ++si) {
			const time = times[ti] + 1800;
			const rawv = variations[si][ti];
			const vv = rawv != null ? rawv + (shiftVariation ?? 0) : null;
			const idx = ti * slen + si;
			const lonShift = resp.stations[si].drift_longitude;
			// if (vv < maxVar) maxVar = vv;
			if (vv == null) ++nullCount;
			else if (vv >= 0) ++posCount;
			data[0][idx] = time;
			data[1][idx] = (360 + ((time % 86400) / 86400) * 360 + lonShift) % 360;
			data[2][idx] = vv;
			data[3][idx] = si;
		}
	}

	const ndata = Array.from(Array(4), () => new Array(slen * tlen - posCount - nullCount));
	const pdata = Array.from(Array(4), () => new Array(posCount));
	let pi = 0,
		ni = 0;
	for (let idx = 0; idx < slen * tlen; ++idx) {
		const vv = data[2][idx];
		if (vv == null) continue;
		if (vv >= 0) {
			pdata[0][pi] = data[0][idx];
			pdata[1][pi] = data[1][idx];
			pdata[2][pi] = vv;
			pdata[3][pi] = data[3][idx];
			pi++;
		} else {
			ndata[0][ni] = data[0][idx];
			ndata[1][ni] = data[1][idx];
			ndata[2][ni] = vv;
			ndata[3][ni] = data[3][idx];
			ni++;
		}
	}
	console.log('circles data', resp, [resp.time, pdata, ndata]);
	return [resp.time, pdata, ndata];
}

export function drawCirclesLegend({
	params,
	overlayHandle: { size, position, defaultPos },
	plotData,
}: {
	params: CirclesPlotParams & BasicPlotParams;
	overlayHandle: ReturnType<typeof usePlotOverlay>;
	plotData: any;
}) {
	return withCapturedOverrides((u: uPlot) => {
		if (!params.showLegend) return;
		const px = (a: number) => scaled(a * devicePixelRatio);

		const pos = position.current ?? defaultPos(u, size.current);

		const x = scaled(pos.x);
		let y = scaled(pos.y);
		const ctx = u.ctx;
		ctx.save();
		ctx.font = font();

		const szCompPos = circlesSizeComputer(u, params, plotData[1][2], POS_S);
		const szCompNeg = circlesSizeComputer(u, params, plotData[2][2], NEG_S);
		const szComp = (v: number) => (v > 0 ? szCompPos(v) : szCompNeg(v));

		const vars = [-5, -2, -1, 2];
		const sizes = vars.map(szComp);

		const szMax = sizes[0];
		const width = szMax + ctx.measureText('−3 %').width + px(12);
		const height = sizes.reduce((a, b) => a + Math.max(getFontSize(), b)) + px(18);
		if (!applyOverrides?.scale) size.current = { width, height };

		ctx.lineWidth = px(1);
		ctx.strokeStyle = color('dark');
		ctx.fillStyle = color('bg');
		ctx.fillRect(x, y, width, height);
		ctx.strokeRect(x, y, width, height);
		ctx.textAlign = 'left';
		ctx.lineCap = 'butt';

		y += 0 + px(3);
		for (const [i, variation] of vars.entries()) {
			const sz = Math.max(getFontSize(), sizes[i]);
			ctx.fillStyle = color('text');
			ctx.fillText(variation.toString().replace('-', '−').padStart(2, '  ') + ' %', x + szMax + px(8), y + sz / 2);
			ctx.beginPath();
			ctx.arc(x + szMax / 2 + px(4), y + sz / 2, sizes[i] / 2, 0, Math.PI * 2);
			ctx.fillStyle = color(variation > 0 ? 'cyan2' : 'magenta2');
			ctx.strokeStyle = color(variation > 0 ? 'cyan' : 'magenta');
			ctx.stroke();
			ctx.fill();
			y += sz + px(4);
		}
		u.ctx.stroke();

		u.ctx.restore();
	});
}
