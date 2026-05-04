import { useContext, useMemo } from 'react';
import { useEventsSettings } from './util';
import { LayoutContext, useNodeExists, type LayoutContextType, type NodeParams } from '../../app/layout';
import { useEventsDebounced, useEventsState, useFeidCursor, useSelectedSource } from './eventsState';
import { useTable } from './editableTables';
import { useFeidSample } from './feid';
import { useCompoundTable } from './query';
import type { EruptiveEvent } from './sourceActions';
import type { BasicPlotParams } from '../../plots/common/types';
import { useCrowWindowDebounced } from '../../crow/core/crowSettings';
import { paddedInterval } from '../../plots/common/basicPlot';

export type Onset = { time: Date; type: string | null; secondary?: boolean; insert?: boolean };

export type MagneticCloud = { start: Date; end: Date };

export type FlareOnset = { time: Date; sources: string[]; flare: EruptiveEvent<'flare'> };

export function usePlot<T = unknown>(): NodeParams<BasicPlotParams & T> {
	const layout = useContext(LayoutContext) as unknown as LayoutContextType<BasicPlotParams & T>;
	const settings = useEventsSettings();
	const { plotUnlistedEvents, plotOffset } = settings;
	const crowMode = useNodeExists('Crow Controls');
	const crowWindow = useCrowWindowDebounced();

	const table = useTable('feid', true);
	const sample = useFeidSample(true);

	const plotId = useEventsDebounced('plotId');
	const modifyId = useEventsState((state) => state.modifyId);
	const setStartAt = useEventsState((state) => state.setStartAt);
	const setEndAt = useEventsState((state) => state.setEndAt);

	const plotContext: Partial<BasicPlotParams> = useMemo(() => {
		const feid = table.getById(plotId);

		if (!feid && !crowMode) return {};

		const interval = (() => {
			if (crowMode) return crowWindow.plot;
			const plotDate = setStartAt || feid!.time;
			const hour = Math.floor(plotDate.getTime() / 36e5) * 3600;
			return {
				start: hour + plotOffset[0] * 3600,
				end: hour + plotOffset[1] * 3600,
			};
		})();

		const fetchInterval = crowMode ? crowWindow.fetch : paddedInterval(interval);

		const timeIdx = table.index.time;
		const durIdx = table.index.duration;
		const start = (row: (typeof table.data)[number]) => (row[timeIdx] as Date).getTime() / 1e3;
		const end = (row: (typeof table.data)[number]) => start(row) + (row[durIdx] as number) * 3600;
		const events = table.data
			.filter((row) => interval.start <= end(row) && start(row) <= interval.end)
			.filter((row) => plotUnlistedEvents || sample.data.find((sr) => sr[0] === row[0]))
			.filter((row) => (!setStartAt && !setEndAt) || row[0] !== modifyId);

		const [onsets, ends] = [0, 36e5].map((end) =>
			events.map(
				(row) =>
					({
						time: new Date(+row[timeIdx]! + end * +row[table.index.duration]!),
						type: row[table.index.onset_type],
						secondary: setStartAt || row[0] !== plotId,
					}) as Onset,
			),
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
			interval,
			fetchInterval,
			base: feid?.base_period,
			onsets,
			ends,
			clouds,
		};
	}, [table, plotId, setStartAt, plotOffset, setEndAt, plotUnlistedEvents, sample.data, modifyId, crowMode, crowWindow]);

	return useMemo(() => {
		return {
			...settings,
			...layout?.params,
			...plotContext,
			...(!settings.showMagneticClouds && { clouds: [] }),
			stretch: true,
		};
	}, [settings, plotContext, layout?.params]);
}

export function useSolarPlot() {
	const cursor = useEventsDebounced('cursor', 1500);
	const { start: feidTime } = useFeidCursor(true);
	const plotOffsetSolar = useEventsSettings((st) => st.plotOffsetSolar);
	const erupt = useSelectedSource('sources_erupt', true);
	const flr = useCompoundTable('flare', true);
	const cme = useCompoundTable('cme', true);

	return useMemo(() => {
		const focusTime =
			(cursor?.entity === 'flare'
				? flr?.entry(flr.data[cursor.row]).start_time
				: cursor?.entity === 'cme'
					? cme?.entry(cme.data[cursor.row]).time
					: (erupt?.flr_start ?? erupt?.cme_time)) ?? new Date((feidTime.getTime() ?? 0) - 3 * 864e5);
		const [start, end] = plotOffsetSolar.map((o) => focusTime.getTime() / 1e3 + o * 3600);
		const interval = { start, end };

		const flrTidx = flr?.columns.findIndex((col) => col.sql_name === 'start_time');
		const flrStart = (row: any) => row[flrTidx!].getTime() / 1e3;
		const flares = flr?.data.filter((row) => start <= flrStart(row) && flrStart(row) <= end).map((row) => flr.entry(row));

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

export function usePlotContextValue() {}
