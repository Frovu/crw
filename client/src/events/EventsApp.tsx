import { useContext, useState, useRef, useMemo, useEffect } from 'react';
import { useSize, useEventListener, clamp, Size } from '../util';
import EventsDataProvider from './EventsData';
import AppLayout from './Layout';
import { sampleEditingMarkers } from './Sample';
import { Cursor, MagneticCloud, MainTableContext, Onset, PanelParams, PlotContext,
	defaultPlotParams, SampleContext, Sort, TableViewContext, useEventsSettings, useViewState, plotOptions } from './events';
import TableView from './TableView';
import CorrelationPlot from '../plots/Correlate';
import EpochCollision from '../plots/EpochCollision';
import HistogramPlot from '../plots/Histogram';
import PlotCircles from '../plots/time/Circles';
import PlotGeoMagn from '../plots/time/Geomagn';
import PlotIMF from '../plots/time/IMF';
import PlotSW from '../plots/time/SW';
import PlotGSM from '../plots/time/GSM';

export function ContextMenuContent({ params, setParams }: { params: PanelParams, setParams: (p: Partial<PanelParams>) => void }) {
	return <>
		<div> asdasd</div>
		{/* <label><select value={params.color} onChange={e => setParams({ color: e.target.value })}>
			{['blue', 'orange', 'green'].map(cl => <option key={cl} value={cl}>{cl}</option>)}
		</select></label> */}
	</>;
}

export function LayoutContent({ size, params: state }: { size: Size, params: PanelParams }) {
	const plotContext = useContext(PlotContext);
	const type = state.type;

	const params = useMemo(() => {
		return plotContext && plotOptions.includes(type as any) && {
			...defaultPlotParams,
			...plotContext!,
			stretch: true,
			showTimeAxis: true,
			showMetaInfo: true
		};
	}, [plotContext, type]);

	return <div style={{ height: '100%', border: type === 'MainTable' ? 'unset' : '1px var(--color-border) solid', userSelect: 'none', overflow: 'clip' }}>
		{type === 'MainTable' && <MainTablePanel size={size}/>}
		{params && <>
			{type === 'Histogram' && <HistogramPlot/>}
			{type === 'Correlation' && <CorrelationPlot/>}
			{type === 'Epoch collision' && <EpochCollision/>}
			{type === 'IMF + Speed' && <PlotIMF {...{ params }}/>}
			{type === 'SW Plasma' && <PlotSW {...{ params }}/>}
			{type === 'Cosmic Rays' && <PlotGSM {...{ params }}/>}
			{type === 'Geomagn' && <PlotGeoMagn {...{ params }}/>}
			{type === 'Ring of Stations' && <>
				<PlotCircles {...{ params }}/>
				<a style={{ backgroundColor: 'var(--color-bg)', position: 'absolute', top: 0, right: 4 }}
					href='./ros' target='_blank' onClick={() => window.localStorage.setItem('plotRefParams', JSON.stringify(params))}>link</a>
			</>}
		</>}
	</div>;
}

function MainTablePanel({ size }: { size: Size }) {
	const { columns, data: allData } = useContext(MainTableContext);
	const { data: sampleData } = useContext(SampleContext);
	const { data: shownData } = useContext(TableViewContext);
	const { plotId, setPlotId, cursor, setCursor } = useViewState();

	useEffect(() => {;
		const magn = columns.findIndex(c => c.id === 'fe_magnitude');
		if (plotId == null || !shownData.find(r => r[0] === plotId))
			setPlotId(() => sampleData.findLast(r => r[magn] as number > 2.5)?.[0] as number ?? null);
	}, [sampleData, columns, plotId, setPlotId, shownData]);

	const plotMove = (dir: -1 | 0 | 1, global?: boolean) => () => setPlotId(current => {
		if (dir === 0) { // set cursor to plotted line
			if (cursor)
				return shownData[cursor.row][0] as number;
			const found = shownData.findIndex(r => r[0] === allData[current!]?.[0]);
			if (found >= 0) setCursor({ row: found, column: 0 });
		}
		if (current == null)
			return null;
		if (global)
			return allData[clamp(0, allData.length - 1, allData.findIndex(r => r[0] === current) + dir)][0] as number;
		const found = shownData.findIndex(r => r[0] === allData[current][0]);
		const curIdx = found >= 0 ? found : cursor?.row;
		if (curIdx == null) return current;
		const movedIdx = clamp(0, shownData.length - 1, curIdx + dir);
		return shownData[movedIdx][0] as number;
	});

	useEventListener('action+plot', plotMove(0));
	useEventListener('action+plotPrev', plotMove(-1, true));
	useEventListener('action+plotNext', plotMove(+1, true));
	useEventListener('action+plotPrevShown', plotMove(-1));
	useEventListener('action+plotNextShown', plotMove(+1));

	return <TableView size={size}/>;
}

function EventsView() {
	const { showAverages, showColumns, plotOffsetDays } = useEventsSettings();
	const { columns, data } = useContext(MainTableContext);
	const { sample, data: sampleData, isEditing: editingSample, setFilters } = useContext(SampleContext);
	const [viewExport, setViewExport] = useState(false);
	const sort = useViewState(state => state.sort);
	const plotId = useViewState(state => state.plotId);
	
	const dataContext = useMemo(() => {
		console.time('compute table');
		const cols = columns.filter(c => showColumns.includes(c.id));
		const enabledIdxs = [0, ...cols.map(c => columns.findIndex(cc => cc.id === c.id))];
		const sortIdx = 1 + cols.findIndex(c => c.id === (sort.column === '_sample' ? 'time' : sort.column ));
		const renderedData = sampleData.map(row => enabledIdxs.map(ci => row[ci]));
		const markers = editingSample && sample ? sampleEditingMarkers(sampleData, sample, columns) : null;
		const idxs = [...renderedData.keys()], column = cols[sortIdx-1];
		idxs.sort((a: number, b: number) => sort.direction * (['text','enum'].includes(column?.type) ?
			(renderedData[a][sortIdx] as string ??'').localeCompare(renderedData[b][sortIdx] as string ??'') :
			(renderedData[a][sortIdx]??0 as any) - (renderedData[b][sortIdx]??0 as any)));
		if (markers && sort.column === '_sample') {
			const weights = { '  ': 0, 'f ': 1, ' +': 2, 'f+': 3, ' -': 4, 'f-': 5  } as any;
			idxs.sort((a, b) => ((weights[markers[a]] ?? 9) - (weights[markers[b]] ?? 9)) * sort.direction);
		}
		const averages = showAverages ? null : cols.map((col, i) => {
			if (col.type !== 'real') return null;
			const sorted = renderedData.map(row => row[i + 1]).filter(v => v != null).sort() as number[];
			if (!sorted.length) return null;
			const mid = Math.floor(sorted.length / 2);
			const median = sorted.length % 2 === 0 ? ((sorted[mid-1] + sorted[mid]) / 2) : sorted[mid];
			const sum = sorted.reduce((a, b) => a + b, 0);
			const n = sorted.length;
			const mean = sum / n;
			const std = Math.sqrt(sorted.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
			const sem = std / Math.sqrt(n);
			return [median, mean, std, sem];
		});
		console.timeEnd('compute table');
		return {
			averages,
			data: idxs.map(i => renderedData[i]),
			markers: markers && idxs.map(i => markers[i]),
			columns: cols
		};
	}, [columns, sampleData, editingSample, sample, sort, showAverages, showColumns]);

	const plotContext = useMemo(() => {
		const idx = plotId && data.findIndex(r => r[0] === plotId);
		if (idx == null || idx < 0) return null;
		const [timeIdx, onsIdx, cloudTime, cloudDur] = ['fe_time', 'fe_onset_type', 'mc_time', 'mc_duration'].map(c => columns.findIndex(cc => cc.id === c));
		const plotDate = data[idx][timeIdx] as Date;
		const hour = Math.floor(plotDate.getTime() / 36e5) * 36e5;
		const interval = plotOffsetDays.map(days => new Date(hour + days * 864e5));
		const allNeighbors = data.slice(Math.max(0, idx - 4), Math.min(data.length, idx + 4));
		const onsets = allNeighbors.filter(r => !viewExport || sampleData.find(sr => sr[0] === r[0]))
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
	}, [plotId, data, plotOffsetDays, columns, viewExport, sampleData]);

	useEventListener('action+exportPlot', () => plotContext && setViewExport(true));

	useEventListener('setColumn', e => {
		// const which = e.detail.which, column = e.detail.column.id;
		// const corrKey = which === 1 ? 'columnX' : 'columnY';
		// const histKey = 'column' + Math.min(which - 1, 2) as keyof HistOptions;
		// setOpt('correlation', corr => ({ ...corr, [corrKey]: column }));
		// setOpt('hist', corr => ({ ...corr, [histKey]: corr[histKey]  === column ? null : column }));
	});

	// useEventListener('action+addFilter', () => setFilters(fltrs => {
	// 	if (!cursor)
	// 		return [...fltrs, { filter: { column: 'fe_magnitude', operation: '>=', value: '3' }, id: Date.now() }];
	// 	const column =  dataContext.columns[cursor?.column];
	// 	const val = dataContext.data[cursor?.row]?.[cursor?.column+1];
	// 	const operation = val == null ? 'not null' : column.type === 'enum' ? '==' : column.type === 'text' ? 'regexp' : '>=';
	// 	const value = (val instanceof Date ? val.toISOString().replace(/T.*/,'') : val?.toString()) ?? '';
	// 	return [...fltrs, { filter: { column: column.id, operation, value }, id: Date.now() }];
	// }));
	// useEventListener('action+removeFilter', () => setFilters(fltrs => fltrs.slice(0, -1)));

	return (
		<TableViewContext.Provider value={dataContext}> 
			<PlotContext.Provider value={plotContext}>
				<AppLayout/>
			</PlotContext.Provider>
		</TableViewContext.Provider>
	);
}

export default function EventsApp() {
	return <EventsDataProvider>
		<EventsView/>
	</EventsDataProvider>;
}