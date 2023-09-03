import uPlot from 'uplot';
import { BasicPlot, DefaultPosition, PosRef, SizeRef, applyTextTransform, axisDefaults, basicDataQuery, color,customTimeSplits, drawArrow, drawMagneticClouds, drawOnsets, usePlotOverlayPosition } from './plotUtil';
import { markersPaths } from './plotPaths';
import { GSMParams } from './GSM';

export function tracePaths(posRef: PosRef, sizeRef: SizeRef, defaultPos: DefaultPosition, params: GSMParams): uPlot.Series.PathBuilder {
	const colorLine = color('green', .8);
	const colorArrow = color('magenta');
	const colorArrowMc = color('gold');
	const px = (a: number) => a * devicePixelRatio;

	return (u, seriesIdx) => {
		const { left, top, width: fullWidth, height: fullHeight } = u.bbox;
		const height = fullHeight * .6;
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
		const nLines = 10;
		const lineStep = Math.max(3, Math.floor((length - 12) / nLines));
		for (let i = 4; i < length - 3; i += lineStep) {
			const a0x = u.valToPos(u.data[0][i]!, 'x', true);
			const val = u.data[params.useA0m ? 3 : 2][i];
			if (val == null)
				continue;
			const a0y = u.valToPos(val, 'a0', true);
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

function anisotropyPlotOptions(overlay: ReturnType<typeof usePlotOverlayPosition>, defaultPos: DefaultPosition, params: GSMParams): Partial<uPlot.Options> {
	const [pos, size, handleDrag] = overlay;
	const filterAxy = (u: uPlot, splits: number[]) => splits.map(sp => sp < u.scales.az.max! / 3 + u.scales.az.min! ? sp : null);
	return {
		padding: [8, params.showAz ? 0 : 60, params.showTimeAxis ? 0 : 8, 0],
		hooks: {
			drawAxes: params.showMetaInfo ? [
				u => (params.clouds?.length) && drawMagneticClouds(u, params.clouds, u.valToPos(0, 'a0', true)),
				u => (params.onsets?.length) && drawOnsets(u, params.onsets),
			] : [],
			ready: [
				handleDrag
			]
		},
		axes: [
			{
				...axisDefaults(params.showGrid),
				...customTimeSplits(params)
			},
			{
				...axisDefaults(params.showGrid),
				label: '',
				scale: 'a0',
				incrs: [1, 2, 3, 5, 10, 20],
				filter: (u, splits) => splits.map(sp => sp <= 0 ? sp : null),
				ticks: {
					...axisDefaults(params.showGrid).ticks,
					filter: (u, splits) => splits.map(sp => sp <= 0 ? sp : null)
				}
			},
			{
				show: params.showAz,
				side: 1,
				...axisDefaults(false),
				label: '',
				scale: 'az',
				incrs: [.5, 1, 2, 3, 5, 10, 20],
				ticks: { ...axisDefaults(false).ticks, filter: filterAxy },
				filter: filterAxy
			},
		],
		scales: {
			x: { },
			a0: {
				range: (u, min, max) => [min-.1, -1.5 * min + 1]
			},
			az: {
				range: (u, min, max) => [Math.min(0, min) - 1, (Math.max(max, 3.5) - min) * 3 - min + 3]
			}
		},
		series: [
			{ },
			{
				show: params.showAz,
				scale: 'az',
				label: 'Az(GSM)',
				stroke: color('cyan'),
				width: 2,
				points: {
					show: params.showMarkers,
					stroke: color('cyan'),
					fill: color('cyan', .8),
					paths: markersPaths('triangleUp', 6)
				}
			},
			...['A0', 'A0m'].map(what => ({
				scale: 'a0',
				show: what === (params.useA0m ? 'A0m' : 'A0'),
				label: what + '(GSM)',
				stroke: color('peach'),
				width: 2,
				points: {
					show: params.showMarkers,
					stroke: color('peach'),
					fill: color('peach', .8),
					paths: markersPaths('diamond', 6)
				}
			})),
			{
				label: 'vector',
				stroke: color('magenta'),
				paths: tracePaths(pos, size, defaultPos, params),
				points: { show: false }
			}
		]
	};
}

export default function PlotGSMAnisotropy(params: GSMParams) {

	const defaultPos = () => ({ x: 8, y: 8 });
	const overlay = usePlotOverlayPosition(defaultPos);

	return (<BasicPlot {...{
		queryKey: ['GSMani', params.interval, params.maskGLE, params.subtractTrend],
		queryFn: () => basicDataQuery('api/gsm/', params.interval, ['time', 'az', 'a10', 'a10m', 'ax', 'ay'], {
			mask_gle: params.maskGLE ? 'true' : 'false', // eslint-disable-line camelcase
			subtract_trend: params.subtractTrend ? 'true' : 'false' // eslint-disable-line camelcase
		}),
		options: anisotropyPlotOptions(overlay, defaultPos, params),
		params,
		labels: {
			a0: [`A0${params.useA0m ? 'm' : ''}(GSM) var, %`, 1 / 5],
			...(params.showAz && { az: ['Az(GSM) var, %', 1 / 4] })
		},
		legend: [{
			'vector': 'CR Equatorial anisotropy vector ',
			'A0(GSM)': 'CR Density var, % ',
			'A0m(GSM)': 'CR Density var (corrected), %',
			'Az(GSM)': 'CR North-south anisotropy var, %'
		}, {
			'vector': 'arrow',
			'A0(GSM)': 'diamond',
			'A0m(GSM)': 'diamond',
			'Az(GSM)': 'triangleUp'
		}]
	}}/>);
}