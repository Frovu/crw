import { useMemo } from 'react';
import { useEventsSettings } from '../../events/events';
import { rowAsDict, useEventsState, useFeidCursor, useSource } from '../../events/eventsState';
import { serializeCoords, useCompoundTable } from '../../events/sources';
import type uPlot from 'uplot';
import { color } from '../../app';
import { font, scaled } from '../plotUtil';

type FlareOnset = { time: Date, sources: string[], flare: { class: string, lat: number, lon: number, src: string } };

export function flaresOnsetsPlugin({ show, flares, focusTime }: { show: boolean, flares: FlareOnset[], focusTime: Date }): uPlot.Plugin {
	const scale = scaled(1);
	const px = (a: number) => a * scale;
	return {
		hooks: {
			drawSeries: [ (u, si) => {
				if (si !== 1)
					return;
				const ctx = u.ctx;
				ctx.save();
				ctx.beginPath();
				ctx.font = font(px(12));
				ctx.lineWidth = px(1);
				ctx.textAlign = 'right';
				ctx.textBaseline = 'bottom';
				ctx.lineCap = 'round';
				const { width: w } = ctx.measureText('99E99W');
				const hl = px(30);
				let lastX = 0, lastY = 0, lastSrc = '';
				for (const { time, flare } of flares) {
					ctx.stroke();
					ctx.beginPath();
					const col = focusTime.getTime() === time.getTime() ? 'active'
						: ['A', 'B', 'C'].includes((flare.class ?? 'A')[0]) ? 'text-dark' : 'white';
					ctx.strokeStyle = ctx.fillStyle = color(col);
					const x = u.valToPos(time.getTime() / 1e3, 'x', true);
					const y = u.valToPos(u.data[1][u.valToIdx(time.getTime() / 1e3)]!, 'y', true);
					ctx.moveTo(x - px(1), y - px(1));
					ctx.lineTo(x - px(1), Math.max(px(12), y - hl / 2));
					if (x - lastX < w && Math.abs(y - lastY) < px(12))
						continue;
					if (x - lastX < w && flare.src !== lastSrc)
						continue;
					ctx.lineTo(x - px(1), Math.max(px(12), y - hl));
					ctx.fillText(serializeCoords(flare), x + px(2), y - hl);
					lastY = y;
					lastX = x;
					lastSrc = flare.src;
				}
				ctx.stroke();
				ctx.restore();
			} ]
		}
	};
}

export function useSolarPlotContext() {
	const cursor = useEventsState(s => s.cursor);
	const { start: feidTime } = useFeidCursor();
	const { plotOffsetSolar } = useEventsSettings();
	const erupt = useSource('sources_erupt', true);
	const flr = useCompoundTable('flare');

	const focusTime = cursor?.entity === 'flares' ?
		rowAsDict(flr.data[cursor.row], flr.columns).start_time as Date
		: (erupt?.flr_start ?? erupt?.cme_time) as Date
		?? new Date((feidTime?.getTime() ?? 0) - 3 * 864e5);
	const interval = plotOffsetSolar.map(o =>
		new Date(focusTime.getTime() + o * 36e5)) as [Date, Date];

	return useMemo(() => {
		const flrTidx = flr.columns.findIndex(c => c.id === 'start_time');
		const flares = flr.data.filter(r =>
			interval[0] <= r[flrTidx]! && r[flrTidx]! <= interval[1]).map(r => rowAsDict(r, flr.columns));
		const flrs = new Map();
		for (const flare of flares) {
			const { start_time: time, src } = flare;
			const k = (time as any).getTime();
			const old = flrs.get(k);
			flrs.set(k, {
				sources: [...(old?.sources ?? []), src],
				flare: old?.flare ?? flare,
				time,
			});
		}
		return {
			focusTime,
			interval,
			flares: Array.from(flrs.values()) as FlareOnset[]
		};
	}, [flr, interval[0].getTime(), interval[1].getTime()]); // eslint-disable-line
}