import { useContext, useEffect, useMemo, useRef } from 'react';
import { AuthContext, useContextMenu, openContextMenu, useAppSettings } from '../app';
import { type ParamsSetter, type LayoutsMenuDetails, useLayout, setStatColumn, LayoutContext } from '../layout';
import CorrelationPlot, { CorrelationContextMenu } from '../plots/Correlate';
import EpochCollision, { EpochCollisionContextMenu } from '../plots/EpochCollision';
import HistogramPlot, { HistogramContextMenu } from '../plots/Histogram';
import { clamp, dispatchCustomEvent, useEventListener, useSize } from '../util';
import { ExportControls, ExportPreview, PlotIntervalInput, renderOne } from './ExportPlot';
import { type PanelParams, type TableMenuDetails, useViewState, statPanelOptions,
	useEventsSettings, plotPanelOptions, defaultPlotParams, type CommonPlotParams,
	type TableParams, copyAverages, valueToString, MainTableContext, PlotContext,
	SampleContext, TableViewContext, findColumn } from './events';
import { useSampleState, defaultFilterOp } from './sample';
import { ColorsSettings } from '../Colors';
import PlotCircles from '../plots/time/Circles';
import PlotGSM from '../plots/time/GSM';
import PlotGeoMagn from '../plots/time/Geomagn';
import PlotIMF from '../plots/time/IMF';
import PlotSW from '../plots/time/SW';
import ColumnsSelector from './Columns';
import ImportMenu from './Import';
import SampleView from './Sample';
import TableView from './TableView';

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
		{type === 'ColorSettings' && <ColorsSettings/>}
		{type === 'Histogram' && <HistogramPlot/>}
		{type === 'Correlation' && <CorrelationPlot/>}
		{type === 'Superposed epochs' && <EpochCollision/>}
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
		const magn = shownColumns.findIndex(c => c.fullName === 'magnitude') + 1; // +1 for id col
		if (plotId != null && (plotUnlistedEvents || shownData.find(r => r[0] === plotId)))
			return;
		const sorted = shownData.slice(-10).sort((a: any, b: any) => a[magn] - b[magn]);
		setPlotId(() => sorted.at(-1)?.[0] ?? null);
	}, [sampleData, plotId, setPlotId, shownData, shownColumns, plotUnlistedEvents]);

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
		if (!['integer', 'real'].includes(col.type)) return null;
		const sorted = (shownData.map(row => row[i + 1]).filter(v => v != null)  as number[]).sort((a, b) => a - b);
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

	useEventListener('action+setX', () =>
		cursor && setStatColumn(shownColumns[cursor.column], 0));
	useEventListener('action+setY', () =>
		cursor && setStatColumn(shownColumns[cursor.column], 1));
	useEventListener('action+computeRow', () =>
		cursor && dispatchCustomEvent('computeRow', { id: shownData[cursor.row][0] }));
	useEventListener('action+addFilter', () => {
		const column = cursor ? shownColumns[cursor.column] :
			(findColumn(shownColumns, 'magnitude')
			?? shownColumns.find(c => c.type === 'real')
			?? columns.find(c => c.type === 'real')!);
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

export function EventsContextMenu({ params, setParams }: { params: PanelParams, setParams: ParamsSetter }) {
	const { role } = useContext(AuthContext);
	const details = (useContextMenu(state => state.menu?.detail) || null) as LayoutsMenuDetails & TableMenuDetails | null;
	const { toggleSort, setPlotId } = useViewState();
	const layout = useLayout();
	const statsPresent = Object.values(layout.items).some(p => statPanelOptions.includes(p?.type as any));
	const column = details?.cell?.column ?? details?.header;
	const value = details?.cell?.value;
	const rowId = details?.cell?.id;
	const averages = details?.averages;
	const { set, ...settings } = useEventsSettings();
	const { addFilter } = useSampleState(); 
	const isEventPlot = plotPanelOptions.includes(params.type as any);
	const isPlot = isEventPlot || statPanelOptions.includes(params.type as any);
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
		{params.type === 'Correlation' && <CorrelationContextMenu {...{ params, setParams }}/>}
		{params.type === 'Histogram' && <HistogramContextMenu {...{ params, setParams }}/>}
		{params.type === 'Superposed epochs' && <EpochCollisionContextMenu {...{ params, setParams }}/>}
		{params.type === 'MainTable' && <>
			{averages && <>
				<button onClick={() => copyAverages(averages, 'row')}>Copy {averages?.label}</button>
				<button onClick={() => copyAverages(averages, 'col')}>Copy column averages</button>
				<button onClick={() => copyAverages(averages, 'all')}>Copy all averages</button>
				<div className='separator'/>
			</>}
			<button onClick={() => dispatchCustomEvent('action+openColumnsSelector')}>Select columns</button>
			<div className='separator'/>
			{rowId != null && <>
				<button onClick={() => setPlotId(() => rowId)}>Plot this event</button>
				<div className='separator'/>
			</>}
			{column && <>
				{role && <button onClick={() => dispatchCustomEvent('computeRow', { id: rowId })}>Recompute row</button>}
				{column.isComputed && role &&
					<button onClick={() => dispatchCustomEvent('computeColumn', { column })}>Recompute column</button>}
				<button onClick={() => toggleSort(column.id, 1)}>Sort ascending</button>
				<button onClick={() => toggleSort(column.id, -1)}>Sort descening</button>
				{statsPresent && <><button onClick={() => setStatColumn(column, 0)}>Use as X</button>
					<button onClick={() => setStatColumn(column, 1)}>Use as Y</button></>}
				{value !== undefined && <button style={{ maxWidth: 232 }} onClick={() => addFilter(column, value)}
				>Filter {column.fullName} {defaultFilterOp(column, value)} {valueToString(value)}</button>}
			</>}
			{!column && <button onClick={openContextMenu('tableExport', undefined, true)}>Export table</button>}
			{!column && role && <>
				<button onClick={() => dispatchCustomEvent('action+openImportMenu')}>Import table</button>
				<button onClick={() => dispatchCustomEvent('computeAll')}>Recompute everything</button>
			</>}
			{!column && <><div className='separator'/><div className='Group'>
				<CheckboxTable text='Show column averages' k='showAverages'/>
				<CheckboxTable text='Show changes log' k='showChangelog'/>
			</div></>}
		</>}
		{isEventPlot && 
			<PlotIntervalInput/>}
		{isPlot && <>
			<div className='separator'/>
			<div className='Row'>
				<CheckboxGlob text='grid' k='showGrid'/>
				{isEventPlot && <CheckboxGlob text='markers' k='showMarkers'/>}
				<CheckboxGlob text='legend' k='showLegend'/>
			</div>
		</>}
		{isEventPlot && <>
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
				{params.type === 'Ring of Stations' && <>
					<div>Exclude:<input type='text' style={{ marginLeft: 4, width: '10em', padding: 0 }}
						defaultValue={cur.exclude?.join(',') ?? ''}
						onChange={e => JSON.stringify(e.target.value.split(/\s*,\s*/g).filter(s => s.length>3)) !== JSON.stringify(cur.exclude)
							&& setParams('plotParams', { exclude: e.target.value.split(/\s*,\s*/g).filter(s => s.length>3) })}/></div>
					<div className='Row'>
						<Checkbox text='Filter' k='autoFilter'/>
						<Checkbox text='Linear size' k='linearSize'/>
					</div> <div className='Row'>
						<Checkbox text='Extended plot' k='rsmExtended'/>
						<Checkbox text='pIndex' k='showPrecursorIndex'/>
					</div> <div className='Row'>
						<input style={{ width: '6em' }}
							type='number' min='-99' max='99' step='.05' value={cur.variationShift?.toFixed(2) ?? ''} placeholder='shift'
							onChange={e => setParams('plotParams', { variationShift:
								(isNaN(e.target.valueAsNumber) || e.target.valueAsNumber === 0) ? undefined : e.target.valueAsNumber })}></input>
						<input style={{ width: '6em' }}
							type='number' min='-200' max='200' step='2' value={cur.sizeShift?.toFixed(0) ?? ''} placeholder='size'
							onChange={e => setParams('plotParams', { sizeShift:
								(isNaN(e.target.valueAsNumber) || e.target.valueAsNumber === 0) ? undefined : e.target.valueAsNumber })}></input>
					</div>
				</>}
			</div>
		</>}
		{(isPlot || statPanelOptions.includes(params.type as any)) && <>
			<div className='separator'/>
			{details && <button onClick={() => renderOne(details.nodeId)}>Open image in new tab</button>}
		</>}
	</>;
}