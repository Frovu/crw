import { useContext, useMemo, useEffect, useRef } from 'react';
import { useEventListener, clamp, useSize, dispatchCustomEvent } from '../util';
import EventsDataProvider from './EventsData';
import AppLayout, { LayoutContext, LayoutsMenuDetails, ParamsSetter, setNodeParams, useLayout } from '../Layout';
import { defaultFilterOp, sampleEditingMarkers, useSampleState } from './sample';
import { MagneticCloud, MainTableContext, Onset, PanelParams, PlotContext,
	defaultPlotParams, SampleContext, TableViewContext, useEventsSettings,
	useViewState, plotPanelOptions, CommonPlotParams, TableMenuDetails, valueToString, TableParams, statPanelOptions } from './events';
import TableView from './TableView';
import CorrelationPlot, { CorrelationContextMenu } from '../plots/Correlate';
import EpochCollision from '../plots/EpochCollision';
import HistogramPlot from '../plots/Histogram';
import PlotCircles from '../plots/time/Circles';
import PlotGeoMagn from '../plots/time/Geomagn';
import PlotIMF from '../plots/time/IMF';
import PlotSW from '../plots/time/SW';
import PlotGSM from '../plots/time/GSM';
import SampleView from './Sample';
import { AuthContext, useAppSettings, useContextMenu } from '../app';
import { ExportControls, ExportPreview, renderOne } from './ExportPlot';
import ColumnsSelector from './Columns';
import ImportMenu from './Import';
import { ContextMenu } from '../App';

export function PlotIntervalInput({ step: alterStep }: { step?: number }) {
	const { plotOffset, set } = useEventsSettings();
	const [left, right] = plotOffset;
	const step = alterStep ?? 24;

	return <div style={{ display: 'inline-flex', gap: 4, cursor: 'default' }} title='Plot time interval, as hours offset from event onset'>
		Interval: <input style={{ width: 54, height: '1.25em' }} type='number' min='-240' max='0' step={step} defaultValue={left}
			onChange={e => !isNaN(e.target.valueAsNumber) && set('plotOffset', [e.target.valueAsNumber, right])}/>
		/ <input style={{ width: 54, height: '1.25em' }} type='number' min={step} max='240' step={step} defaultValue={right}
			onChange={e => !isNaN(e.target.valueAsNumber) && set('plotOffset', [left, e.target.valueAsNumber])}/> h
	</div>;
}

export function ContextMenuContent({ params, setParams }: { params: PanelParams, setParams: ParamsSetter }) {
	const { role } = useContext(AuthContext);
	const details = (useContextMenu(state => state.menu?.detail) || null) as LayoutsMenuDetails & TableMenuDetails | null;
	const { toggleSort, setPlotId } = useViewState();
	const layout = useLayout();
	const statsPresent = Object.values(layout.items).some(p => statPanelOptions.includes(p?.type as any));
	const setStatColumn = (col: string, i: number) => {
		const key = (['column0', 'column1'] as const)[i];
		for (const [id, item] of Object.entries(layout.items))
			if (statPanelOptions.includes(item?.type as any))
				setNodeParams(id, 'statParams', { [key]: col });
	};
	const column = details?.cell?.column ?? details?.header;
	const value = details?.cell?.value;
	const rowId = details?.cell?.id;
	const { set, ...settings } = useEventsSettings();
	const { addFilter } = useSampleState(); 
	const isPlot = plotPanelOptions.includes(params.type as any);
	const cur = (isPlot && {
		...defaultPlotParams,
		...params?.plotParams
	}) as CommonPlotParams;

	const CheckboxGlob = ({ text, k }: { text: string, k: keyof typeof settings }) =>
		<label>{text}<input type='checkbox' style={{ paddingLeft: 4 }}
			checked={settings[k] as boolean} onChange={e => set(k, e.target.checked)}/></label>;
	const Checkbox = ({ text, k }: { text: string, k: keyof CommonPlotParams }) =>
		<label>{text}<input type='checkbox' style={{ paddingLeft: 4 }}
			checked={cur[k] as boolean} onChange={e => setParams('plotParams', { [k]: e.target.checked })}/></label>;
	const CheckboxTable = ({ text, k }: { text: string, k: keyof TableParams }) =>
		<label>{text}<input type='checkbox' style={{ paddingLeft: 4 }}
			checked={params.tableParams?.[k] as boolean} onChange={e => setParams('tableParams', { [k]: e.target.checked })}/></label>;

	return <>
		{params.type === 'Correlation' && <>
			<CorrelationContextMenu {...{ params, setParams }}/>
		</>}
		{params.type === 'MainTable' && <>
			<button onClick={() => dispatchCustomEvent('action+openColumnsSelector')}>Select columns</button>
			<div className='separator'/>
			{rowId != null && <>
				<button onClick={() => setPlotId(() => rowId)}>Plot this event</button>
				<div className='separator'/>
			</>}
			{column && <>
				{column.generic && (column.generic.is_own || role === 'admin') &&
					<button onClick={() => dispatchCustomEvent('computeGeneric', { id: column.generic!.id })}>Re-compute</button>}
				<button onClick={() => toggleSort(column.id, 1)}>Sort ascending</button>
				<button onClick={() => toggleSort(column.id, -1)}>Sort descening</button>
				{statsPresent && <><button onClick={() => setStatColumn(column.id, 0)}>Use as X</button>
					<button onClick={() => setStatColumn(column.id, 1)}>Use as Y</button></>}
				{value != null && <button onClick={() => addFilter(column, value)}
				>Filter {column.name} {defaultFilterOp(column, value)} {valueToString(value)}</button>}
				<div className='separator'/>
			</>}
			{!column && role && <>
				<button onClick={() => dispatchCustomEvent('action+openImportMenu')}>Import table</button>
				<div className='separator'/>
			</>}
			<div className='Group'>
				<CheckboxTable text='Show column averages' k='showAverages'/>
				<CheckboxTable text='Show changes log' k='showChangelog'/>
			</div>
		</>}
		{isPlot && <>
			<PlotIntervalInput/>
			<div className='separator'/>
			<div className='Row'>
				<CheckboxGlob text='grid' k='showGrid'/>
				<CheckboxGlob text='markers' k='showMarkers'/>
				<CheckboxGlob text='legend' k='showLegend'/>
			</div>
			<div className='separator'/>
			<div className='Row'>
				<Checkbox text='time axis' k='showTimeAxis'/>
				<Checkbox text='meta' k='showMetaInfo'/>
				<Checkbox text='label' k='showMetaLabels'/>
			</div>
			<div className='Row'>
				<CheckboxGlob text='show unlisted' k='plotUnlistedEvents'/>
				<CheckboxGlob text='show MCs' k='showMagneticClouds'/>
			</div>
			<div className='separator'/>
			<div className='Group'>
				{params.type === 'Cosmic Rays' && <>
					<div className='Row'>
						<Checkbox text='Show Axy' k='showAxy'/>
						<Checkbox text='Az' k='showAz'/>
						<Checkbox text='vector' k='showAxyVector'/>
					</div>
					<Checkbox text='Use corrected A0m' k='useA0m'/>
					<Checkbox text='Subtract trend' k='subtractTrend'/>
					<Checkbox text='Mask GLE' k='maskGLE'/>
				</>}
				{params.type === 'SW Plasma' && <>
					<Checkbox text='Show T index' k='useTemperatureIndex'/>
					<Checkbox text='Show beta' k='showBeta'/>
				</>}
				{params.type === 'IMF + Speed' && <>
					<Checkbox text='Show Bx, By' k='showBxBy'/>
					<Checkbox text='Show Bz' k='showBz'/>
				</>}
			</div>
		</>}
		{(isPlot || statPanelOptions.includes(params.type as any)) && <>
			<div className='separator'/>
			{details && <button onClick={() => renderOne(details.nodeId)}>Open image in new tab</button>}
		</>}
	</>;
}

export function LayoutContent() {
	const { params: { plotParams, type } } = useContext(LayoutContext)!; 
	const settings = useEventsSettings();
	const appState = useAppSettings();
	const plotContext = useContext(PlotContext);

	const params = useMemo(() => {
		return appState && plotContext && plotPanelOptions.includes(type as any) && {
			...defaultPlotParams,
			...settings,
			...plotContext!,
			...plotParams,
			...(!settings.showMagneticClouds && { clouds: [] }),
			stretch: true,
		};
	}, [appState, plotContext, type, settings, plotParams]);

	return <div style={{ height: '100%', border: type === 'MainTable' ? 'unset' : '1px var(--color-border) solid', userSelect: 'none', overflow: 'clip' }}>
		{type === 'MainTable' && <MainTablePanel/>}
		{type === 'ExportControls' && <ExportControls/>}
		{type === 'ExportPreview' && <ExportPreview/>}
		{type === 'Histogram' && <HistogramPlot/>}
		{type === 'Correlation' && <CorrelationPlot/>}
		{type === 'Epoch collision' && <EpochCollision/>}
		{params && <>
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

function MainTablePanel() {
	const { size, params: { tableParams } } = useContext(LayoutContext)!;
	const { columns, data: allData } = useContext(MainTableContext);
	const { data: sampleData } = useContext(SampleContext);
	const { data: shownData, columns: shownColumns } = useContext(TableViewContext);
	const { plotUnlistedEvents } = useEventsSettings();
	const { plotId, setPlotId, cursor, setCursor } = useViewState();
	const { addFilter } = useSampleState();
	const ref = useRef<HTMLDivElement | null>(null);
	useSize(ref.current);

	// always plot something
	useEffect(() => {
		const magn = columns.findIndex(c => c.id === 'fe_magnitude');
		if (plotId != null && (plotUnlistedEvents || shownData.find(r => r[0] === plotId)))
			return;
		const sorted = shownData.slice(-10).sort((a: any, b: any) => a[magn] - b[magn]);
		setPlotId(() => sorted.at(-1)?.[0] ?? null);
	}, [sampleData, columns, plotId, setPlotId, shownData, plotUnlistedEvents]);

	const plotMove = (dir: -1 | 0 | 1, global?: boolean) => () => setPlotId(current => {
		if (dir === 0) {
			if (cursor) return shownData[cursor.row][0];
			// set cursor to plotted line
			const found = shownData.findIndex(r => r[0] === current);
			if (found >= 0) queueMicrotask(() => setCursor({ row: found, column: 0 }));
			return current; }
		if (current == null)
			return null;
		if (plotUnlistedEvents && global)
			return allData[clamp(0, allData.length - 1, allData.findIndex(r => r[0] === current) + dir)][0];
		const found = shownData.findIndex(r => r[0] === current);
		if (found >= 0)
			return shownData[clamp(0, shownData.length - 1, found + dir)][0];
		const aIdx = allData.findIndex(r => r[0] === current);
		const search = (r: typeof allData[number]) => shownData.find(sr => sr[0] === r[0]);
		const closest = dir > 0 ? allData.slice(aIdx).find(search) : allData.slice(0, aIdx).findLast(search);
		return closest?.[0] ?? null;
	});
	
	const averages = useMemo(() => !tableParams?.showAverages ? [] : shownColumns.map((col, i) => {
		if (col.type !== 'real') return null;
		const sorted = shownData.map(row => row[i + 1]).filter(v => v != null).sort() as number[];
		if (!sorted.length) return null;
		const mid = Math.floor(sorted.length / 2);
		const median = sorted.length % 2 === 0 ? ((sorted[mid-1] + sorted[mid]) / 2) : sorted[mid];
		const sum = sorted.reduce((a, b) => a + b, 0);
		const n = sorted.length;
		const mean = sum / n;
		const std = Math.sqrt(sorted.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
		const sem = std / Math.sqrt(n);
		return [median, mean, std, sem];
	}), [shownColumns, shownData, tableParams?.showAverages]);

	useEventListener('action+plot', plotMove(0));
	useEventListener('action+plotPrev', plotMove(-1, true));
	useEventListener('action+plotNext', plotMove(+1, true));
	useEventListener('action+plotPrevShown', plotMove(-1));
	useEventListener('action+plotNextShown', plotMove(+1));

	useEventListener('action+addFilter', () => {
		const column = cursor ? shownColumns[cursor.column] : undefined;
		const val = cursor ? shownData[cursor.row][cursor.column + 1] : undefined;
		addFilter(column, val);
	});

	return <>
		<ImportMenu/>
		<ColumnsSelector/>
		<SampleView ref={ref}/>
		<TableView averages={averages} size={{ ...size, height: size.height - (ref.current?.offsetHeight ?? 28) }}/>
	</>;
}

function EventsView() {
	const { shownColumns, plotOffset, plotUnlistedEvents } = useEventsSettings();
	const { columns, data } = useContext(MainTableContext);
	const { current: sample, data: sampleData } = useContext(SampleContext);
	const editingSample = useSampleState(state => state.isPicking);
	const sort = useViewState(state => state.sort);
	const plotId = useViewState(state => state.plotId);
	
	const dataContext = useMemo(() => {
		console.time('compute table');
		const cols = columns.filter(c => shownColumns.includes(c.id));
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