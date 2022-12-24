import uPlot from 'uplot';

import { Onset } from '../table/Table';

export function drawOnsets(u: uPlot, onsets: Onset[]) {
	for (const onset of onsets) {
		const OnsetX = u.valToPos(onset.time.getTime() / 1e3, 'x');
		const useColor = onset.secondary ? color('text', .6) : color('white');
		u.ctx.save();
		u.ctx.fillStyle = u.ctx.strokeStyle = useColor;
		u.ctx.font = font(14).replace('400', '600');
		u.ctx.lineWidth = 2;
		u.ctx.beginPath();
		u.ctx.moveTo(u.bbox.left + OnsetX, u.bbox.top);
		u.ctx.lineTo(u.bbox.left + OnsetX, u.bbox.top + u.bbox.height);
		u.ctx.stroke();
		u.ctx.fillText(onset.type || 'E',
			u.bbox.left + OnsetX + 4, u.bbox.top + u.bbox.height + 8);
		u.ctx.restore();
	}
}

export function customTimeSplits(): Partial<uPlot.Axis> {
	return {
		splits: (u, ax, min, max, incr, space) => {
			const num = Math.floor(u.width / 76);
			const width = Math.ceil((max - min) / num);
			const split = ([ 4, 6, 12, 24 ].find(s => width <= s * 3600) || 48) * 3600;
			const start = Math.ceil(min / split) * split;
			const limit = Math.ceil((max - split/4 - start) / split);
			return Array(limit).fill(1).map((a, i) => start + i * split);
		},
		values: (u, splits) => splits.map((v, i) => {
			if (v % 86400 !== 0)
				return null;
			const d = new Date(v * 1e3);
			const month = String(d.getUTCMonth() + 1).padStart(2, '0');
			const day = String(d.getUTCDate()).padStart(2, '0');
			const showYear = (v - splits[0] < 86400) && String(d.getUTCFullYear());
			return (showYear ? showYear + '-' : '     ') + month + '-' + day;
		})
	};
}

export function axisDefaults(): Partial<uPlot.Axis> {
	return {
		font: font(14),
		stroke: color('text'),
		grid: { stroke: color('grid'), width: 1 },
		ticks: { stroke: color('grid'), width: 1 },
	};
}

export function color(name: string, opacity=1) {
	const col = window.getComputedStyle(document.body).getPropertyValue('--color-'+name) || 'red';
	return col.includes('rgb') ? `rgba(${col.match(/[\d.]+/g)!.slice(0,3).join(',')},${opacity})` : col;
}

export function font(size=16) {
	const fnt = window.getComputedStyle(document.body).font;
	return fnt.replace(/\d+px/, size+'px');
}