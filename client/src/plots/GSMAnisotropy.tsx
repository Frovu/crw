import uPlot from 'uplot';
import { BasicPlot, axisDefaults, basicDataQuery, color, customTimeSplits, drawArrow, drawCustomLabels, drawCustomLegend, drawMagneticClouds, drawOnsets } from './plotUtil';
import { markersPaths } from './plotPaths';
import { GSMParams } from './GSM';

export function tracePaths(params: GSMParams): uPlot.Series.PathBuilder {
	const colorLine = color('green');
	const colorArrow = color('magenta');
	const colorArrowMc = color('gold');

	let xpos: number = 0, ypos: number = 0;
	let xposClick: number = xpos, yposClick: number = ypos;
	let clickx = 0, clicky = 0, drag = false;
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
		u.ctx.lineWidth = .7;
		u.ctx.strokeStyle = colorLine;
		u.ctx.stroke();

		u.ctx.beginPath();
		u.ctx.lineWidth = 2;
		u.ctx.moveTo(points[0][0], points[0][1]);
		for (let i = 1; i < length; ++i) {
			const [ax, ay, dx, dy] = points[i];
			if (dx != null) {
				if (params.showMarkers) {
					drawArrow(u.ctx, dx, dy, ax, ay, 7);
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

		u.ctx.beginPath();
		u.ctx.strokeStyle = u.ctx.fillStyle = colorArrow;
		u.ctx.lineWidth = 2;
		x = xpos = xpos || 22;
		y = ypos = ypos || 40;
		u.ctx.lineWidth = 2;
		u.ctx.rect(x, y, 8, 8);
		const xarrow = Math.floor(64 / scalex);
		const yarrow = Math.floor(64 / scaley);
		const legendWidth = xarrow * scalex + 12, legendHeight = yarrow * scaley + 4;
		u.ctx.moveTo(x, y + 12);
		drawArrow(u.ctx, 0, yarrow * scaley, x, y + yarrow * scaley);
		u.ctx.moveTo(x + 12, y);
		drawArrow(u.ctx, xarrow * scalex, 0, x + xarrow * scalex, y);

		u.ctx.textAlign = 'left';
		u.ctx.fillText(`Ax, ${yarrow}%`, x + 8, y + yarrow * scaley - 16);
		u.ctx.fillText(`Ay, ${xarrow}%`, x + xarrow * scalex - 40, y - 16);
		u.ctx.stroke();

		u.ctx.restore();

		u.over.parentElement!.onmousemove = e => {
			if (!drag) return;
			const dx = (e.clientX - u.rect.left + u.bbox.left) * devicePixelRatio - clickx;
			const dy = (e.clientY - u.rect.top + u.bbox.top) * devicePixelRatio - clicky;
			xpos = Math.max(12, Math.min(xposClick! + dx, -8 + u.rect.width + u.bbox.left));
			ypos = Math.max(30, Math.min(yposClick! + dy, 12 + u.bbox.height - legendHeight));
			u.redraw();
		};
		u.over.parentElement!.onmousedown = e => {
			clickx = (e.clientX - u.rect.left + u.bbox.left) * devicePixelRatio;
			clicky = (e.clientY - u.rect.top + u.bbox.top) * devicePixelRatio;
			if (clickx >= xpos && clickx <= xpos + legendWidth && clicky >= ypos - 24 && clicky <= ypos + legendHeight) {
				xposClick = xpos;
				yposClick = ypos;
				drag = true;
			}
		};
		u.over.parentElement!.onmouseup = u.over.parentElement!.onmouseleave = e => {
			drag = false;
		};
		return null;
	};
}

function anisotropyPlotOptions(params: GSMParams): Partial<uPlot.Options> {
	const filterAxy = (u: uPlot, splits: number[]) => splits.map(sp => sp < u.scales.az.max! / 3 + u.scales.az.min! ? sp : null);
	return {
		padding: [10, params.showAz ? 4 : 64, params.paddingBottom ?? 0, 0],
		legend: { show: params.interactive },
		cursor: {
			show: params.interactive,
			drag: { x: false, y: false, setScale: false }
		},
		hooks: {
			drawAxes: [
				u => (params.clouds?.length) && drawMagneticClouds(u, params.clouds, u.valToPos(0, 'a0', true)),
				u => (params.onsets?.length) && drawOnsets(u, params.onsets),
			],
			draw: [
				u => drawCustomLabels({
					a0: [`A0${params.useA0m ? 'm' : ''}(GSM) var, %`, u.height / 5],
					...(params.showAz && { az: ['Az(GSM) var, %', u.height / 4] })
				})(u),
				params.showLegend ? drawCustomLegend( {
					'vector': 'CR Equatorial anisotropy vector ',
					'A0(GSM)': 'CR Density var, % ',
					'A0m(GSM)': 'CR Density var (corrected), %',
					'Az(GSM)': 'CR North-south anisotropy var, %'
				 }, {
					'vector': 'arrow',
					'A0(GSM)': 'diamond',
					'A0m(GSM)': 'diamond',
					'Az(GSM)': 'triangleUp'
				 }) : () => {}
			],
		},
		axes: [
			{
				...axisDefaults(params.showGrid),
				...customTimeSplits()
			},
			{
				...axisDefaults(params.showGrid),
				label: '',
				scale: 'a0',
				incrs: [1, 2, 2.5, 5, 10, 20],
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
				incrs: [.5, 1, 2, 2.5, 5, 10, 20],
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
				paths: tracePaths(params),
				points: { show: false }
			}
		]
	};
}

export default function PlotGSMAnisotropy(params: GSMParams) {
	return (<BasicPlot {...{
		queryKey: ['GSMani', params.interval, params.maskGLE, params.subtractTrend],
		queryFn: () => basicDataQuery('api/gsm/', params.interval, ['time', 'az', 'a10', 'a10m', 'ax', 'ay'], {
			mask_gle: params.maskGLE ? 'true' : 'false', // eslint-disable-line camelcase
			subtract_trend: params.subtractTrend ? 'true' : 'false' // eslint-disable-line camelcase
		}),
		options: anisotropyPlotOptions(params),
		params
	}}/>);
}