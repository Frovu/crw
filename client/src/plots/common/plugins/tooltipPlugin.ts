import { color } from '../../../app/app';
import { prettyDate } from '../../../util';

export function tooltipPlugin({
	html,
	sidx: userSidx,
	onclick,
	disableFocus,
}: {
	sidx?: (u: uPlot, sidx: number) => number;
	onclick?: (u: uPlot, dIdx: number) => void;
	html?: (u: uPlot, sIdx: number, dIdx: number) => string;
	disableFocus?: boolean;
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
		const xval = isScatter ? (u.data as any)[sidx][0][dataIdx!] : u.data[0][dataIdx!];

		const top = u.valToPos(val, series.scale ?? 'y');
		const lft = u.valToPos(xval, 'x');
		const flip = tooltipLeftOffset + lft + tooltip.clientWidth + 10 >= u.width;
		const flipY = tooltipTopOffset + top + tooltip.clientHeight + 5 >= u.height;

		const left = tooltipLeftOffset + lft + shiftX * (flip ? -1 : 1);
		tooltip.style.top = tooltipTopOffset + top + shiftY + 'px';
		tooltip.style.left =
			(flip ? Math.max(left, tooltip.clientWidth) : Math.min(left, u.width - tooltip.clientWidth)) + 'px';
		tooltip.style.transform =
			flip && flipY ? 'translate(-100%,-100%)' : flip ? 'translateX(-100%)' : flipY ? 'translateY(-100%)' : 'unset';
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
				...(!disableFocus && {
					focus: {
						prox: 32,
						dist: (u, sidx, didx, valPos, curPos) => {
							if (isHidden(u, sidx)) return Infinity;
							return curPos - valPos;
						},
						...opts.cursor?.focus,
					},
				}),
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
					const sidx = userSidx ? userSidx(u, seriesIdx!) : seriesIdx!;
					const idx = u.cursor.idxs?.[sidx] ?? null;
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
