import { useMemo } from 'react';
import { useEventsSettings, type Flare } from '../../events/core/eventsSettings';
import { rowAsDict, useEventsState, useFeidCursor, useSelectedSource } from '../../events/core/eventsState';
import { serializeCoords, useCompoundTable } from '../../events/core/sourceActions';
import type uPlot from 'uplot';
import { color } from '../../app';
import { font, scaled } from '../plotUtil';
import type { BasicPlotParams } from '../basicPlot';

type FlareOnset = { time: Date; sources: string[]; flare: Flare };

export function flaresOnsetsPlugin({
	params,
	flares,
	focusTime,
}: {
	params: BasicPlotParams;
	flares: FlareOnset[];
	focusTime: Date;
}): uPlot.Plugin {
	const { showMetaInfo, showMetaLabels } = params;
	const scale = scaled(1);
	const px = (a: number) => a * scale;
	return {
		hooks: {
			drawSeries: [
				(u, si) => {
					if (si !== 1 || !showMetaInfo) return;
					const ctx = u.ctx;
					ctx.save();
					ctx.beginPath();
					ctx.font = font(px(12));
					ctx.lineWidth = px(1);
					ctx.textAlign = 'right';
					ctx.textBaseline = 'bottom';
					ctx.lineCap = 'round';
					const { width: w } = ctx.measureText('99E99W');
					const hl = px(16);
					let lastX = 0,
						lastY = 0,
						lastSrc = '';
					for (const { time, flare } of flares) {
						ctx.stroke();
						ctx.beginPath();
						const col =
							focusTime.getTime() === time.getTime()
								? 'active'
								: ['A', 'B', 'C'].includes((flare.class ?? 'A')[0])
								? 'text-dark'
								: 'white';
						ctx.strokeStyle = ctx.fillStyle = color(col);
						const tm = (flare.peak_time?.getTime() ?? time.getTime()) / 1e3;
						const x = u.valToPos(tm, 'x', true);
						const y = u.valToPos(u.data[1][u.valToIdx(tm)]!, 'xray', true);
						ctx.moveTo(x, y - px(1));
						ctx.lineTo(x, y - hl / 2);
						if (showMetaLabels && x - lastX < w && Math.abs(y - lastY) < px(12)) continue;
						if (showMetaLabels && x - lastX < w && flare.src !== lastSrc) continue;
						ctx.lineTo(x, y - hl);
						if (showMetaLabels) {
							if (y < px(24)) {
								ctx.beginPath();
								ctx.moveTo(x, y - px(2));
								ctx.lineTo(x - hl / 2, y - px(2));
								ctx.fillText(serializeCoords(flare), x - hl / 2 - px(2), y + px(8));
							} else {
								ctx.fillText(serializeCoords(flare), x + px(18), y - hl);
							}
						}
						lastY = y;
						lastX = x;
						lastSrc = flare.src;
					}
					ctx.stroke();
					ctx.restore();
				},
			],
		},
	};
}

export function useSolarPlotContext() {
	const cursor = useEventsState((s) => s.cursor);
	const { start: feidTime } = useFeidCursor();
	const { plotOffsetSolar } = useEventsSettings();
	const erupt = useSelectedSource('sources_erupt', true);
	const flr = useCompoundTable('flare');
	const cme = useCompoundTable('cme');

	const focusTime =
		cursor?.entity === 'flares'
			? (rowAsDict(flr.data[cursor.row], flr.columns).start_time as Date)
			: cursor?.entity === 'CMEs'
			? (rowAsDict(cme.data[cursor.row], cme.columns).time as Date)
			: ((erupt?.flr_start ?? erupt?.cme_time) as Date) ?? new Date((feidTime?.getTime() ?? 0) - 3 * 864e5);
	const interval = plotOffsetSolar.map((o) => new Date(focusTime.getTime() + o * 36e5)) as [Date, Date];

	return useMemo(() => {
		const flrTidx = flr.columns.findIndex((c) => c.id === 'start_time');
		const flares = flr.data
			.filter((r) => interval[0] <= r[flrTidx]! && r[flrTidx]! <= interval[1])
			.map((r) => rowAsDict(r, flr.columns));
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
			flares: Array.from(flrs.values()) as FlareOnset[],
		};
	}, [flr, interval[0].getTime(), interval[1].getTime()]); // eslint-disable-line
}
