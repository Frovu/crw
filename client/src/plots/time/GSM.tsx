import uPlot from 'uplot';
import BasicPlot from '../BasicPlot';
import { type CustomScale, type BasicPlotParams, applyTextTransform, basicDataQuery } from '../basicPlot';
import { color, drawArrow, usePlotOverlay, type PlotOverlayHandle } from '../plotUtil';
import { useRef, type MutableRefObject } from 'react';
import { distToSegment } from '../../util';
import { usePlot } from '../../events/core/plot';
import type { ContextMenuProps } from '../../layout';

const defaultParams = {
	maskGLE: true,
	useA0m: true,
	subtractTrend: true,
	showAz: true,
	showAxy: true,
	showAxyVector: false,
};

export type GSMParams = typeof defaultParams;

type VectorCache = MutableRefObject<number[][] | undefined>;

function tracePaths(
	scl: number,
	{ size, position, defaultPos }: PlotOverlayHandle,
	params: GSMParams & BasicPlotParams,
	posCache: VectorCache
): uPlot.Series.PathBuilder {
	const colorLine = color('skyblue');
	const colorArrow = color('magenta');
	const colorArrowMc = color('gold');
	const px = (a: number) => a * scl * devicePixelRatio;

	return (u, seriesIdx) => {
		const { left, top, width: fullWidth, height: fullHeight } = u.bbox;
		const { bottom: posBottom, top: posTop } = (u.scales.vec as CustomScale).positionValue ?? { bottom: 1 / 2, top: 1 };
		const height = fullHeight * (posTop - posBottom);
		const width = fullWidth * 0.85;
		const dataX = u.data[seriesIdx + 1] as number[]; // swapped
		const dataY = u.data[seriesIdx] as number[];
		const length = dataX.length;
		const x0 = dataX[0],
			y0 = dataY[0];
		let minx = x0,
			maxx = x0,
			miny = y0,
			maxy = y0;
		let x = minx as number,
			y = miny as number;
		for (let i = 0; i < length; i++) {
			x += dataX[i] as number;
			y += dataY[i] as number;
			if (x < minx) minx = x;
			if (y < miny) miny = y;
			if (x > maxx) maxx = x;
			if (y > maxy) maxy = y;
		}
		const xrange = maxx - minx;
		const yrange = maxy - miny;
		const scalex = width / Math.max(xrange, 10);
		const scaley = height / Math.max(yrange, 10);
		const shiftx = width * 0.6 - (minx + xrange / 2) * scalex;
		const shifty = top + (1 - posTop) * fullHeight - miny * scaley;

		const points = Array(length).fill([0, 0, 0, 0]);
		x = left + x0 * scalex + shiftx;
		y = top + y0 * scaley + shifty;

		points[0] = [x, y];
		posCache.current = Array(length);
		for (let i = 1; i < length; i++) {
			const dx = dataX[i] == null ? null : dataX[i] * scalex;
			const dy = dataY[i] * scaley;
			posCache.current[i] = [x, y, dx!, dy];
			x += dx ?? 3;
			y += dy;
			points[i] = [x, y, dx, dy];
		}

		u.ctx.save();
		u.ctx.beginPath();
		const nMaxLines = 12;
		const lineStep = [6, 8, 12, 24].find((s) => s > length / nMaxLines) ?? 48;
		const H = 3600;
		const rem = lineStep - (Math.floor(u.data[0][0] / H) % lineStep);
		for (let i = rem; i < length; i += lineStep) {
			const a0x = u.valToPos(u.data[0][i]!, 'x', true);
			const val = u.data[3][i];
			if (val == null) continue;
			const a0y = u.valToPos(val, 'A0', true);
			const [ax, ay, dx, dy] = points[i];
			const lx = ax - (dx * 2) / 3;
			const ly = ay - (dy * 2) / 3;
			u.ctx.moveTo(lx, ly);
			u.ctx.lineTo(a0x, a0y);
		}
		u.ctx.lineWidth = px(1);
		u.ctx.strokeStyle = colorLine;
		u.ctx.stroke();

		u.ctx.beginPath();
		u.ctx.lineWidth = px(2);
		u.ctx.moveTo(points[0][0], points[0][1]);
		for (let i = 1; i < length; ++i) {
			const [ax, ay, dx, dy] = points[i];
			if (dx != null) {
				if (params.showMarkers) {
					drawArrow(u.ctx, dx, dy, ax, ay, 7 * scl * devicePixelRatio);
				} else {
					u.ctx.lineTo(ax, ay);
				}
				const tstmp = u.data[0][i] * 1000;
				const inMc = params.clouds?.find(({ start, end }) => tstmp > start.getTime() && tstmp <= end.getTime());
				u.ctx.strokeStyle = inMc ? colorArrowMc : colorArrow;
				u.ctx.stroke();
			}
			u.ctx.beginPath();
			u.ctx.moveTo(ax, ay);
		}

		const xArrowPercent = Math.floor((64 * devicePixelRatio * scl) / scalex);
		const yArrowPercent = Math.floor((64 * devicePixelRatio * scl) / scaley);
		const metric = u.ctx.measureText(applyTextTransform(`Ay, ${Math.max(xArrowPercent, yArrowPercent)}%`));
		const lineH = metric.fontBoundingBoxAscent + metric.fontBoundingBoxDescent + 1;
		const lineW = metric.width;
		const arrowRadius = px(6);

		if (scl === 1)
			size.current = {
				width: Math.max(xArrowPercent * scalex, lineW + arrowRadius * 2) + px(2),
				height: yArrowPercent * scaley + lineH + arrowRadius + px(2),
			};
		const { x: lx, y: ly } = position.current ?? defaultPos(u, size.current);
		x = lx * scl + arrowRadius + px(2);
		y = ly * scl + lineH + px(2);

		u.ctx.beginPath();
		u.ctx.strokeStyle = u.ctx.fillStyle = colorArrow;
		u.ctx.lineWidth = px(2);
		u.ctx.rect(x, y, px(8), px(8));
		u.ctx.moveTo(x, y + px(12));
		drawArrow(u.ctx, 0, yArrowPercent * scaley, x, y + yArrowPercent * scaley, scl * devicePixelRatio * 10);
		u.ctx.moveTo(x + px(12), y);
		drawArrow(u.ctx, xArrowPercent * scalex, 0, x + xArrowPercent * scalex, y, scl * devicePixelRatio * 10);

		u.ctx.textAlign = 'left';
		u.ctx.fillText(
			applyTextTransform(`Ax, ${yArrowPercent}%`),
			x + arrowRadius + px(2),
			y + yArrowPercent * scaley - px(4)
		);
		u.ctx.fillText(
			applyTextTransform(`Ay, ${xArrowPercent}%`),
			x + Math.max(0, xArrowPercent * scalex - lineW),
			y - lineH / 2 - arrowRadius + px(2)
		);
		u.ctx.stroke();

		u.ctx.restore();
		return null;
	};
}

function Menu({ Checkbox }: ContextMenuProps<GSMParams>) {
	return (
		<div className="Group">
			<div className="Row">
				<Checkbox text="Show Axy" k="showAxy" />
				<Checkbox text="Az" k="showAz" />
				<Checkbox text="vector" k="showAxyVector" />
			</div>
			<Checkbox text="Use corrected A0m" k="useA0m" />
			<Checkbox text="Subtract trend" k="subtractTrend" />
			<Checkbox text="Mask GLE" k="maskGLE" />
		</div>
	);
}

function Panel() {
	const params = usePlot<GSMParams>();
	const { interval, maskGLE, subtractTrend, useA0m, showAxy, showAxyVector, showAz } = params;

	const vectorCache: VectorCache = useRef<number[][]>([]);
	const vectorLegendHandle = usePlotOverlay(() => ({ x: 8, y: 8 }));

	return (
		<BasicPlot
			{...{
				queryKey: ['GSMani', maskGLE, subtractTrend, useA0m],
				queryFn: async () => {
					const data = await basicDataQuery(
						'cream/gsm',
						interval,
						['time', 'axy', 'az', useA0m ? 'a10m' : 'a10', 'ax', 'ay'],
						{
							mask_gle: maskGLE ? 'true' : 'false', // eslint-disable-line camelcase
							subtract_trend: subtractTrend ? 'true' : 'false', // eslint-disable-line camelcase
						}
					);
					if (data) data[2] = data[2].map((d, i) => data[3][i]! + d!);
					return data;
				},
				params,
				metaParams: {
					truncate: (u) => u.valToPos(u.scales.A0.scaleValue?.max ?? 0, 'A0', true),
					under: true,
				},
				tooltipParams: {
					sidx: (u, si) => (si === 4 ? 1 : si),
				},
				options: () => ({
					focus: { alpha: showAxyVector || showAz ? 1 : 0.7 },
					cursor: {
						focus: {
							prox: 32,
							dist: (u, si, di, valPos, curPos) => {
								if (si !== 4 || !showAxyVector) return valPos - curPos;
								if (!vectorCache.current || di < 1) return Infinity;
								const cx = u.bbox.left + u.cursor.left! * devicePixelRatio;
								const cy = u.bbox.top + u.cursor.top! * devicePixelRatio;
								const [x, y, dx, dy] = vectorCache.current[di];
								return distToSegment(cx, cy, x, y, x + dx, y + dy);
							},
						},
						points: {
							bbox: (u, si) => {
								const di = u.cursor.idxs?.[si];
								if (si !== 4) {
									const x = u.valToPos(u.data[0][di!], 'x');
									const y = u.valToPos(u.data[si][di!]!, u.series[si].scale!);
									return {
										left: x - 4,
										top: y - 4,
										width: 8,
										height: 8,
									};
								} else {
									const [x, y, dx, dy] = vectorCache.current?.[di!] ?? [-99, -99, 0, 0];
									return {
										left: (x - u.bbox.left + dx / 3) / devicePixelRatio - 4,
										top: (y - u.bbox.top + dy / 3) / devicePixelRatio - 4,
										width: 8,
										height: 8,
									};
								}
							},
						},
						dataIdx: (u, sidx, closest, xval) => {
							if (!showAxyVector) return closest;

							const vectors = vectorCache.current;
							const cx = u.cursor.left! * devicePixelRatio + u.bbox.left;
							const cy = u.cursor.top! * devicePixelRatio + u.bbox.top;
							if (!vectors || !cx || !cy) return closest;
							let found,
								minDist = Infinity;
							for (let i = 1; i < vectors?.length; ++i) {
								const [x, y, dx, dy] = vectors[i];
								const x2 = x + dx,
									y2 = y + dy;
								const dist = distToSegment(cx, cy, x, y, x2, y2);
								if (dist < minDist) {
									minDist = dist;
									found = i;
								}
							}

							const x = u.valToPos(xval, 'x', true);
							for (let i = 0; i < 4; ++i) {
								if (!u.series[i].show) continue;
								const y = u.valToPos(u.data[i][closest]!, u.series[i].scale!, true);
								const dist = Math.sqrt((cx - x) ** 2 + (cy - y) ** 2);
								if (dist < minDist) return closest;
							}
							return found ?? closest;
						},
					},
					hooks: {
						ready: [vectorLegendHandle.onReady],
					},
				}),
				axes: () => [
					{
						label: 'A0',
						fullLabel: `A0${useA0m ? 'm' : ''}${showAz ? ' & Az' : ''}, %`,
						position: showAxyVector ? [showAxy ? 1 / 8 : 0, 3 / 5] : [showAxy ? 1 / 4 : 0, 1],
						minMax: [-2, 1],
						whole: true,
					},
					{
						show: showAxy,
						label: 'Axy',
						fullLabel: 'Axy, %',
						position: [0, showAxyVector ? 1 / 9 : 1 / 5],
						minMax: [0, null],
						side: 1,
						showGrid: false,
					},
					{
						show: false,
						label: 'vec',
						position: [1 / 2, 1],
					},
				],
				series: () => [
					{
						show: showAxy,
						label: 'Axy',
						legend: 'Axy (GSM)',
						stroke: color('magenta', 0.75),
						fill: color('magenta', 0.75),
						width: 0,
						bars: true,
						myPaths: (scl) => uPlot.paths.bars!({ size: [0.45, 16 * scl, 1 * scl], align: 0 }),
					},
					{
						show: showAz,
						label: 'Az',
						scale: 'A0',
						legend: 'Az  (GSM)',
						stroke: color('blue'),
						fill: color('blue'),
						width: 0,
						value: (u, val, sidx, i) => (i != null && (val - u.data[3][i]!)?.toFixed(2)) || '--',
						myPaths: (scl) => (u, sidx, i0, i1) => {
							const a0 = u.data[3] as (number | null)[];
							return uPlot.paths.bars!({
								size: [0.17, 2 * scl, 1 * scl],
								align: 1,
								disp: {
									y0: { unit: 1, values: () => a0 },
									y1: { unit: 1, values: () => u.data[sidx] as any },
								},
							})(u, sidx, i0, i1);
						},
					},
					{
						scale: 'A0',
						label: useA0m ? 'A0m' : 'A0',
						legend: `${useA0m ? 'A0m' : 'A0'} (GSM)`,
						stroke: color('green'),
						width: 2,
						marker: 'diamond',
					},
					{
						show: showAxyVector,
						label: 'vector',
						legend: 'Axy vector',
						stroke: color('magenta'),
						myPaths: (scl) => tracePaths(scl, vectorLegendHandle, params, vectorCache),
						marker: 'arrow',
						points: { show: false },
					},
				],
			}}
		/>
	);
}

export const GSMPlot: EventsPanel<GSMParams> = {
	name: 'Cosmic Rays',
	Menu,
	Panel,
	defaultParams,
	isPlot: true,
};
