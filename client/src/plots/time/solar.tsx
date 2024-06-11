import { useMemo } from 'react';
import { useEventsSettings } from '../../events/events';
import { rowAsDict, useFeidCursor, useSource } from '../../events/eventsState';
import { serializeCoords, useCompoundTable } from '../../events/sources';
import type uPlot from 'uplot';
import { color } from '../../app';

type FlareOnset = { time: Date, sources: string[], coords: string };

export function flaresOnsetsPlugin({ show, flares }: { show: boolean, flares: FlareOnset[] }): uPlot.Plugin {
	return {
		hooks: {
			draw: [ u => {
				const ctx = u.ctx;
				ctx.save();
				ctx.strokeStyle = ctx.fillStyle = color('white');
				ctx.lineWidth = 1;
				ctx.textAlign = 'center';
				ctx.restore();
			} ]
		}
	};
}

export function useSolarPlotContext() {
	const { start: feidTime } = useFeidCursor();
	const { plotOffsetSolar } = useEventsSettings();
	const erupt = useSource('sources_erupt');
	const foucsTime = (erupt?.flr_start ?? erupt?.cme_time) as Date
		?? new Date(feidTime?.getTime() ?? 0 - 3 * 864e5);
	const interval = plotOffsetSolar.map(o =>
		new Date(foucsTime.getTime() + o * 36e5)) as [Date, Date];
	
	const flr = useCompoundTable('flare');

	return useMemo(() => {
		const flrTidx = flr.columns.findIndex(c => c.id === 'start_time');
		const flares = flr.data.filter(r =>
			interval[0] <= r[flrTidx]! && r[flrTidx]! <= interval[1]).map(r => rowAsDict(r, flr.columns));
		const flrs = new Map();
		for (const flare of flares) {
			const { time, src } = flare;
			const old = flrs.get(time);
			flrs.set(time, {
				sources: [...(old?.sources ?? []), src],
				coords: old?.coords ?? serializeCoords(flare as any),
			});
		}
		return {
			interval,
			flares: Array.from(flrs.entries()).map(([time, desc]) => ({ time, ...desc }) as FlareOnset)
		};
	}, [flr, interval[0].getTime(), interval[1].getTime()]); // eslint-disable-line
}