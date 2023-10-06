import uPlot from 'uplot';
import { CustomScale, BasicPlot, basicDataQuery, CustomSeries } from '../BasicPlot';
import { BasicPlotParams, PosRef, SizeRef, DefaultPosition, color, drawArrow, applyTextTransform, usePlotOverlayPosition, drawMagneticClouds, drawOnsets } from '../plotUtil';

export type GSMParams = BasicPlotParams & {
	subtractTrend: boolean,
	maskGLE: boolean,
	useA0m: boolean,
	showAxyVector: boolean,
	showAxy: boolean,
	showAz: boolean,
};

function tracePaths(posRef: PosRef, sizeRef: SizeRef, defaultPos: DefaultPosition, params: GSMParams): uPlot.Series.PathBuilder {
	const colorLine = color('skyblue');
	const colorArrow = color('magenta');
	const colorArrowMc = color('gold');
	const px = (a: number) => a * devicePixelRatio;

	return (u, seriesIdx) => {
		const { left, top, width: fullWidth, height: fullHeight } = u.bbox;
		const { bottom: posBottom, top: posTop } = (u.scales.vec as CustomScale).positionValue ?? { bottom: 1/2, top: 1 };
		const height = fullHeight * (posTop - posBottom);
		const width = fullWidth * .85;
		const dataX = u.data[seriesIdx+1]  as number[]; // swapped
		const dataY = u.data[seriesIdx]  as number[];
		const length = dataX.length;
		const x0 = dataX[0], y0 = dataY[0];
		let minx = x0, maxx = x0, miny = y0, maxy = y0;
		let x = minx as number, y = miny as number;
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
		const shiftx = width * .6 - (minx + xrange / 2) * scalex;
		const shifty = top + (1 - posTop) * fullHeight - miny * scaley;

		const points = Array(length).fill([0, 0, 0, 0]);
		x = left + x0 * scalex + shiftx; y = top + y0 * scaley + shifty;

		points[0] = [x, y];
		for (let i = 1; i < length; i++) {
			const dx = dataX[i] == null ? null : dataX[i] * scalex;
			const dy = dataY[i] * scaley;
			x += dx ?? 3; y += dy;
			points[i] = [x, y, dx, dy];
		}

		u.ctx.save();
		u.ctx.beginPath();
		const nMaxLines = 12;
		const lineStep = [6, 8, 12, 24].find(s => s > length / nMaxLines) ?? 48;
		const H = 3600;
		const rem = lineStep - (u.data[0][0] / H) % lineStep;
		for (let i = rem; i < length; i += lineStep) {
			const a0x = u.valToPos(u.data[0][i]!, 'x', true);
			const val = u.data[params.useA0m ? 3 : 4][i];
			if (val == null)
				continue;
			const a0y = u.valToPos(val, 'A0', true);
			u.ctx.moveTo(points[i][0], points[i][1]);
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
					drawArrow(u.ctx, dx, dy, ax, ay, 7 * devicePixelRatio);
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

		const transform = applyTextTransform(params.transformText);
		const xArrowPercent = Math.floor(64 * devicePixelRatio / scalex);
		const yArrowPercent = Math.floor(64 * devicePixelRatio / scaley);
		const metric = u.ctx.measureText(transform(`Ay, ${Math.max(xArrowPercent, yArrowPercent)}%`));
		const lineH = metric.fontBoundingBoxAscent + metric.fontBoundingBoxDescent + 1;
		const lineW = metric.width;
		const arrowRadius = px(6);

		sizeRef.current = {
			width:  Math.max(xArrowPercent * scalex, lineW + arrowRadius * 2) + px(2),
			height: yArrowPercent * scaley + lineH + arrowRadius + px(2)
		};
		const { x: lx, y: ly } = posRef.current ?? defaultPos(u, sizeRef.current);
		x = lx + arrowRadius + px(2); y = ly + lineH + px(2);

		u.ctx.beginPath();
		u.ctx.strokeStyle = u.ctx.fillStyle = colorArrow;
		u.ctx.lineWidth = px(2);
		u.ctx.rect(x, y, px(8), px(8));
		u.ctx.moveTo(x, y + px(12));
		drawArrow(u.ctx, 0, yArrowPercent * scaley, x, y + yArrowPercent * scaley);
		u.ctx.moveTo(x + px(12), y);
		drawArrow(u.ctx, xArrowPercent * scalex, 0, x + xArrowPercent * scalex, y);

		u.ctx.textAlign = 'left';
		u.ctx.fillText(transform(`Ax, ${yArrowPercent}%`), x + arrowRadius + px(2), y + yArrowPercent * scaley - px(4));
		u.ctx.fillText(transform(`Ay, ${xArrowPercent}%`), x + Math.max(0, xArrowPercent * scalex - lineW,), y - lineH / 2 - arrowRadius + px(2));
		u.ctx.stroke();

		u.ctx.restore();
		return null;
	};
}

export default function PlotGSM({ params }: { params: GSMParams }) {
	const defaultPos = () => ({ x: 8, y: 8 });
	const [pos, size, handleDrag] = usePlotOverlayPosition(defaultPos);

	return (<BasicPlot {...{
		queryKey: ['GSMani', params.interval, params.maskGLE, params.subtractTrend],
		queryFn: () => basicDataQuery('cream/gsm', params.interval, ['time', 'axy', 'az', 'a10m', 'a10', 'ax', 'ay'], {
			mask_gle: params.maskGLE ? 'true' : 'false', // eslint-disable-line camelcase
			subtract_trend: params.subtractTrend ? 'true' : 'false' // eslint-disable-line camelcase
		}),
		params,
		options: {
			padding: [8, params.showAxy ? 0 : 60, params.showTimeAxis ? 0 : 8, 0],
			hooks: {
				drawAxes: params.showMetaInfo ? [
					u => drawMagneticClouds(params, u.valToPos(0, 'A0', true))(u),
					u => drawOnsets(params, u.valToPos(0, 'A0', true))(u),
				] : [],
				ready: [ handleDrag ]
			},
		},
		axes: [{
			label: 'A0',
			fullLabel: `A0${params.useA0m ? 'm' : ''}${params.showAz ? ' & Az' : ''} var, %`,
			position: params.showAxyVector ? [params.showAxy ? 1/8 : 0, 3/5] : [params.showAxy ? 1/4 : 0, 1],
			minMax: [-2, 1],
			whole: true,
		}, {
			show: params.showAxy,
			label: 'Axy',
			fullLabel: 'Axy var, %',
			position: [0,  params.showAxyVector ? 1/9 : 1/5],
			minMax: [0, null],
			side: 1,
			showGrid: false,
		}, {
			show: false,
			label: 'vec',
			position: [1/2, 1],
		}],
		series: [{
			show: params.showAxy,
			label: 'Axy',
			legend: 'Axy (GSM, 10GV) var, %',
			stroke: color('magenta', .75),
			fill: color('magenta', .75),
			width: 0,
			paths: uPlot.paths.bars!({ size: [.45, 16, 1], align: 1 }),
		}, {
			show: params.showAz,
			label: 'Az',
			scale: 'A0',
			legend: 'Az  (GSM, 10GV) var, %',
			stroke: color('blue'),
			fill: color('blue'),
			width: 0,
			paths: (u, sidx, i0, i1) => {
				const a0 = u.data[sidx + (params.useA0m ? 1 : 2)] as (number | null)[];
				return uPlot.paths.bars!({
					size: [.17, 2, 1],
					align: 1,
					disp: {
						y0: { unit: 1, values: () => a0 },
						y1: { unit: 1, values: () => a0.map((v, i) => v == null ? null : (v + (u.data[sidx][i] ?? 0))) }
					}
				})(u, sidx, i0, i1);
			}
		},
		...['A0m', 'A0'].map(what => ({
			scale: 'A0',
			show: what === (params.useA0m ? 'A0m' : 'A0'),
			label: what,
			legend: `${params.useA0m ? 'A0m' : 'A0'} (GSM, 10GV) var, %`,
			stroke: color('green'),
			width: 2,
			marker: 'diamond'
		} as CustomSeries)),
		{
			show: params.showAxyVector,
			label: 'vector',
			legend: 'Axy vector',
			stroke: color('magenta'),
			paths: tracePaths(pos, size, defaultPos, params),
			marker: 'arrow',
			points: { show: false }
		}]
	}}/>);
}