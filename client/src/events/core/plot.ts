import { useContext, useMemo } from 'react';
import { useEventsSettings } from './util';
import { LayoutContext, type LayoutContextType } from '../../layout';
import { useEventsState, useFeidCursor, useSelectedSource } from './eventsState';
import { useTable } from './editableTables';
import { useFeidSample } from './feid';
import { useCompoundTable } from './query';
import type { EruptiveEvent } from './sourceActions';
import type { BasicPlotParams } from '../../plots/basicPlot';

export type Onset = { time: Date; type: string | null; secondary?: boolean; insert?: boolean };

export type MagneticCloud = { start: Date; end: Date };

export type FlareOnset = { time: Date; sources: string[]; flare: EruptiveEvent<'flare'> };

export function usePlot<T = {}>() {
	const layout = useContext(LayoutContext) as unknown as LayoutContextType<BasicPlotParams & T>;
	const settings = useEventsSettings();
	const { plotUnlistedEvents, plotOffset } = settings;

	const table = useTable('feid');
	const sample = useFeidSample();

	const plotId = useEventsState((state) => state.plotId);
	const modifyId = useEventsState((state) => state.modifyId);
	const setStartAt = useEventsState((state) => state.setStartAt);
	const setEndAt = useEventsState((state) => state.setEndAt);

	const plotContext = useMemo(() => {
		const feid = table.getById(plotId);

		if (!feid) return { interval: [new Date('2023-01-03'), new Date('2023-01-08')] as [Date, Date] };

		const plotDate = setStartAt || feid.time;
		const baseDate = feid.base_period;
		const hour = Math.floor(plotDate.getTime() / 36e5) * 36e5;
		const interval = plotOffset.map((h) => new Date(hour + h * 36e5));

		const timeIdx = table.index.time;
		const events = table.data
			.filter((row) => interval[0] <= (row[timeIdx] as Date) && (row[timeIdx] as Date) <= interval[1])
			.filter((row) => plotUnlistedEvents || sample.data.find((sr) => sr[0] === row[0]))
			.filter((row) => (!setStartAt && !setEndAt) || row[0] !== modifyId);

		const [onsets, ends] = [0, 36e5].map((end) =>
			events.map(
				(row) =>
					({
						time: new Date(+row[timeIdx]! + end * +row[table.index.duration]!),
						type: row[table.index.onset_type],
						secondary: setStartAt || row[0] !== plotId,
					} as Onset)
			)
		);

		if (setStartAt) onsets.push({ time: setStartAt, type: null, insert: true });
		if (setEndAt) ends.push({ time: setEndAt, type: null, insert: true });

		const clouds = events
			.map((row) => {
				const time = (row[table.index.mc_time] as Date | null)?.getTime(),
					dur = row[table.index.mc_duration] as number | null;
				if (!time || !dur) return null;
				return {
					start: new Date(time),
					end: new Date(time + dur * 36e5),
				};
			})
			.filter((v): v is MagneticCloud => v != null);
		return {
			interval: interval as [Date, Date],
			base: baseDate,
			onsets,
			ends,
			clouds,
		};
	}, [table, plotId, setStartAt, plotOffset, setEndAt, plotUnlistedEvents, sample.data, modifyId]);

	return useMemo(() => {
		return {
			...settings,
			...plotContext,
			...layout?.params,
			...(!settings.showMagneticClouds && { clouds: [] }),
			stretch: true,
		};
	}, [settings, plotContext, layout?.params]);
}

export function useSolarPlot() {
	const cursor = useEventsState((s) => s.cursor);
	const { start: feidTime } = useFeidCursor();
	const plotOffsetSolar = useEventsSettings((st) => st.plotOffsetSolar);
	const erupt = useSelectedSource('sources_erupt', true);
	const flr = useCompoundTable('flare');
	const cme = useCompoundTable('cme');

	return useMemo(() => {
		const focusTime =
			(cursor?.entity === 'flare'
				? flr?.entry(flr.data[cursor.row]).start_time
				: cursor?.entity === 'cme'
				? cme?.entry(cme.data[cursor.row]).time
				: erupt?.flr_start ?? erupt?.cme_time) ?? new Date((feidTime.getTime() ?? 0) - 3 * 864e5);
		const interval = plotOffsetSolar.map((o) => new Date(focusTime.getTime() + o * 36e5)) as [Date, Date];

		const flrTidx = flr?.columns.findIndex((col) => col.sql_name === 'start_time');
		const flares = flr?.data
			.filter((row) => interval[0] <= row[flrTidx!]! && row[flrTidx!]! <= interval[1])
			.map((row) => flr.entry(row));

		const flrs = new Map();
		for (const flare of flares ?? []) {
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
	}, [cme, flr, erupt, cursor, feidTime, plotOffsetSolar]);
}
