import uPlot from 'uplot';
import { BasicPlot, BasicPlotParams, DefaultPosition, PosRef, SizeRef, applyTextTransform, basicDataQuery, color, drawArrow, drawMagneticClouds, drawOnsets, usePlotOverlayPosition } from './plotUtil';
import { markersPaths } from './plotPaths';

export type GSMParams = BasicPlotParams & {
	subtractTrend: boolean,
	maskGLE: boolean,
	useA0m: boolean,
	showAxyVector: boolean,
	showAxy: boolean,
	showAz: boolean,
};

export function tracePaths(posRef: PosRef, sizeRef: SizeRef, defaultPos: DefaultPosition, params: GSMParams): uPlot.Series.PathBuilder {
	const colorLine = color('skyblue');
	const colorArrow = color('magenta');
	const colorArrowMc = color('gold');
	const px = (a: number) => a * devicePixelRatio;

	return (u, seriesIdx) => {
		const { left, top, width: fullWidth, height: fullHeight } = u.bbox;
		const a0top = (u.axes.find(a => a.scale === 'A0') as any).position[1];
		const height = fullHeight * (1 - a0top);
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
		const scalex = width / Math.max(xrange, 20);
		const scaley = height / Math.max(yrange, 20);
		const shiftx = width * .6 - (minx + xrange / 2) * scalex;
		const shifty = (top + height / 2) - (miny + yrange / 2) * scaley;

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
			const val = u.data[params.useA0m ? 4 : 3][i];
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

export default function PlotGSMAnisotropy(params: GSMParams) {
	const defaultPos = () => ({ x: 8, y: 8 });
	const [pos, size, handleDrag] = usePlotOverlayPosition(defaultPos);

	return (<BasicPlot {...{
		queryKey: ['GSMani', params.interval, params.maskGLE, params.subtractTrend],
		queryFn: () => basicDataQuery('api/gsm/', params.interval, ['time', 'axy', 'az', 'a10', 'a10m', 'ax', 'ay'], {
			mask_gle: params.maskGLE ? 'true' : 'false', // eslint-disable-line camelcase
			subtract_trend: params.subtractTrend ? 'true' : 'false' // eslint-disable-line camelcase
		}),
		params,
		options: {
			padding: [8, params.showAz ? 0 : 60, params.showTimeAxis ? 0 : 8, 0],
			hooks: {
				drawAxes: params.showMetaInfo ? [
					u => (params.clouds?.length) && drawMagneticClouds(u, params, u.valToPos(0, 'A0', true)),
					u => (params.onsets?.length) && drawOnsets(u, params, u.valToPos(0, 'A0', true)),
				] : [],
				ready: [ handleDrag ]
			},
		},
		axes: [{
			label: 'A0',
			fullLabel: 'A0' + (params.showAz ? ' & Az' : '') + ' var, %',
			position: [1/8, 2/5],
		}, {
			label: 'Axy',
			fullLabel: 'Axy var, %',
			position: [0, 1/9],
			forceZero: true,
			side: 1,
			showGrid: false,
		}],
		series: [{
			label: 'Axy',
			stroke: color('magenta', .75),
			fill: color('magenta', .75),
			width: 0,
			paths: uPlot.paths.bars!({ size: [.45, 16, 1], align: 1 }),
		}, {
			label: 'Az',
			scale: 'A0',
			stroke: color('blue'),
			fill: color('blue'),
			width: 0,
			paths: (u, sidx, i0, i1) => {
				const a0 = u.data[sidx + (params.useA0m ? 2 : 1)] as (number | null)[];
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
		...['A0', 'A0m'].map(what => ({
			scale: 'A0',
			show: what === (params.useA0m ? 'A0m' : 'A0'),
			label: what,
			stroke: color('green'),
			width: 2,
			points: {
				show: params.showMarkers,
				stroke: color('green'),
				fill: color('green', .8),
				paths: markersPaths('diamond', 6)
			}
		})),
		{
			label: 'vector',
			stroke: color('magenta'),
			paths: tracePaths(pos, size, defaultPos, params),
			points: { show: false }
		}],
		legend: [{
			'A0': 'CR Density var, % ',
			'A0m': 'CR Density var (corrected), %',
			'Az': 'CR North-south anisotropy var, %',
			'Axy': 'CR Equatorial anisotropy var, %',
			'vector': 'CR Equatorial anisotropy vector ',
		}, {
			'vector': 'arrow',
			'A0': 'diamond',
			'A0m': 'diamond'
		}]
	}}/>);
}