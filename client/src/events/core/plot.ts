import { useContext, useMemo } from 'react';
import { type Onset, type MagneticCloud, useEventsSettings } from './eventsSettings';
import { LayoutContext } from '../../layout';
import { useEventsState } from './eventsState';
import { useTable } from './editableTables';
import { useFeidSample } from './feid';

export function usePlotParams() {
	const layout = useContext(LayoutContext);
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
