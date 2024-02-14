import { useContext, useMemo } from 'react';
import { useEventListener } from '../util';
import EventsDataProvider from './EventsData';
import AppLayout from '../Layout';
import { applySample, sampleEditingMarkers, useSampleState } from './sample';
import { type MagneticCloud, MainTableContext, type Onset, PlotContext,
	SampleContext, TableViewContext, useEventsSettings,
	useViewState } from './events';
import ContextMenu from '../ContextMenu';

function EventsView() {
	const { shownColumns, plotOffset, plotUnlistedEvents, showIncludeMarkers } = useEventsSettings();
	const { columns, data } = useContext(MainTableContext);
	const { current: sample, samples, data: sampleData } = useContext(SampleContext);
	const editingSample = useSampleState(state => state.isPicking);
	const sort = useViewState(state => state.sort);
	const plotId = useViewState(state => state.plotId);
	
	const dataCo = useMemo(() => {
		console.time('compute table');
		const cols = columns.filter(c => shownColumns?.includes(c.id));
		const enabledIdxs = [0, ...cols.map(c => columns.findIndex(cc => cc.id === c.id))];
		const sortIdx = 1 + cols.findIndex(c => c.id === (sort.column === '_sample' ? 'time' : sort.column ));
		const renderedData = sampleData.map(row => enabledIdxs.map(ci => row[ci])) as typeof sampleData;
		const markers = editingSample && sample ? sampleEditingMarkers(sampleData, sample, columns) : null;
		const idxs = [...renderedData.keys()], column = cols[sortIdx-1];
		idxs.sort((a: number, b: number) => sort.direction * (['text','enum'].includes(column?.type) ?
			(renderedData[a][sortIdx] as string ??'').localeCompare(renderedData[b][sortIdx] as string ??'') :
			(renderedData[a][sortIdx]??0 as any) - (renderedData[b][sortIdx]??0 as any)));
		if (markers && sort.column === '_sample') {
			const weights = { '  ': 0, 'f ': 1, ' +': 2, 'f+': 3, ' -': 4, 'f-': 5  } as any;
			idxs.sort((a, b) => ((weights[markers[a]] ?? 9) - (weights[markers[b]] ?? 9)) * sort.direction);
		}
		console.timeEnd('compute table');
		return {
			data: idxs.map(i => renderedData[i]),
			markers: markers && idxs.map(i => markers[i]),
			columns: cols
		};
	}, [columns, sampleData, editingSample, sample, sort, shownColumns]);

	const dataContext = useMemo(() => {
		if (!showIncludeMarkers || !sample?.includes?.length)
			return { ...dataCo, includeMarkers: null };
		const smpls = sample.includes.map(sid => samples.find(s => s.id === sid));
		const set = {} as any;
		for (const smpl of smpls) {
			if (!smpl) continue;
			const applied = applySample(data, smpl, columns, samples);
			for (let i = 0; i < applied.length; ++i) {
				set[applied[i][0]] = (set[applied[i][0]] ? set[applied[i][0]] + ';' : '') + smpl.name;
			}
		}
		const markers = dataCo.data.map(r => set[r[0]]);
		return { ...dataCo, includeMarkers: markers };
	}, [columns, data, dataCo, sample?.includes, samples, showIncludeMarkers]);

	const plotContext = useMemo(() => {
		const idx = plotId && data.findIndex(r => r[0] === plotId);
		if (idx == null || idx < 0) return null;
		const [timeIdx, onsIdx, cloudTime, cloudDur] = ['fe_time', 'fe_onset_type', 'mc_time', 'mc_duration'].map(c => columns.findIndex(cc => cc.id === c));
		const plotDate = data[idx][timeIdx] as Date;
		const hour = Math.floor(plotDate.getTime() / 36e5) * 36e5;
		const interval = plotOffset.map(h => new Date(hour + h * 36e5));
		const allNeighbors = data.slice(Math.max(0, idx - 4), Math.min(data.length, idx + 4));
		const onsets = allNeighbors.filter(r => plotUnlistedEvents || sampleData.find(sr => sr[0] === r[0]))
			.map(r => ({ time: r[timeIdx], type: r[onsIdx] || null, secondary: r[0] !== plotId }) as Onset);
		const clouds = allNeighbors.map(r => {
			const time = (r[cloudTime] as Date|null)?.getTime(), dur = r[cloudDur] as number|null;
			if (!time || !dur) return null;
			return {
				start: new Date(time),
				end: new Date(time + dur * 36e5)
			};
		}).filter((v): v is MagneticCloud => v != null);
		return {
			interval: interval as [Date, Date],
			onsets, clouds
		};
	}, [plotId, data, plotOffset, columns, plotUnlistedEvents, sampleData]);

	return (
		<TableViewContext.Provider value={dataContext}> 
			<PlotContext.Provider value={plotContext}>
				<ContextMenu/>
				<AppLayout/>
			</PlotContext.Provider>
		</TableViewContext.Provider>
	);
}

export default function EventsApp() {
	const { reset } = useEventsSettings();
	useEventListener('resetSettings', reset);

	return <EventsDataProvider>
		<EventsView/>
	</EventsDataProvider>;
}