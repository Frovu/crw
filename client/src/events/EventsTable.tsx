import { useContext, useEffect, useMemo, useRef } from 'react';
import { AuthContext, useContextMenu, openContextMenu } from '../app';
import { type LayoutsMenuDetails, useLayout, LayoutContext, type ContextMenuProps, type LayoutContextType, AppLayoutContext } from '../layout';
import { clamp, dispatchCustomEvent, useEventListener, useSize } from '../util';
import { type TableMenuDetails, useEventsSettings,  copyAverages, valueToString,
	SampleContext, TableViewContext, findColumn, setStatColumn, type EventsSettings, type EventsPanel } from './events';
import { useSampleState, defaultFilterOp } from './sample';
import ColumnsSelector from './Columns';
import ImportMenu from './Import';
import SampleView from './Sample';
import TableView from './tables/TableView';
import { useQueryClient } from 'react-query';
import { useEventsState, useTable } from './eventsState';

const defaultParams = {
	showChangelog: false,
	showAverages: true,
	showIncludeMarkers: true,
	hideHeader: false
};

export type MainTableParams = typeof defaultParams;

export function EventsCheckbox({ text, k }: { text: string, k: keyof EventsSettings }) {
	const settings = useEventsSettings.getState();
	return <label>{text}<input type='checkbox' style={{ paddingLeft: 4 }}
		checked={settings[k] as boolean} onChange={e => settings.set(k, e.target.checked)}/></label>;
}

function Panel() {
	const { size, params } = useContext(LayoutContext) as LayoutContextType<MainTableParams>;
	const { columns, data: allData } = useTable();
	const { data: sampleData } = useContext(SampleContext);
	const { data: shownData, columns: shownColumns } = useContext(TableViewContext);
	const { plotUnlistedEvents } = useEventsSettings();
	const { plotId, setPlotId, cursor: sCursor, setCursor } = useEventsState();
	const { addFilter } = useSampleState();
	const ref = useRef<HTMLDivElement | null>(null);
	useSize(ref.current);

	const cursor = sCursor?.entity === 'feid' ? sCursor : null;

	useEffect(() => {
		if (plotId != null && !allData.find(r => r[0] === plotId)) {
			const maxId = Math.max(...allData.map(r => r[0]));
			setPlotId(() => maxId);
		}
	}, [allData, plotId, setPlotId]);
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
			if (found >= 0)
				queueMicrotask(() => setCursor({ row: found, column: 0, entity: 'feid', id: current! }));
			return current; }
		if (current == null)
			return null;
		queueMicrotask(() => setCursor(null));
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
	
	const averages = useMemo(() => !params.showAverages ? [] : shownColumns.map((col, i) => {
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
	}), [shownColumns, shownData, params.showAverages]);

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
		<TableView averages={averages} entity='feid' size={{ ...size, height: size.height - (ref.current?.offsetHeight ?? 28) }}/>
	</>;
}

function Menu({ params, Checkbox }: ContextMenuProps<MainTableParams>) {
	const queryClient = useQueryClient();
	const { role } = useContext(AuthContext);
	const details = (useContextMenu(state => state.menu?.detail) || null) as LayoutsMenuDetails & TableMenuDetails | null;
	const { toggleSort, setPlotId } = useEventsState();
	const panels = Object.values(useContext(AppLayoutContext).panels) as EventsPanel<unknown>[];
	const layout = useLayout();
	const { addFilter } = useSampleState(); 

	const statsPresent = Object.values(layout.items).some(node => panels.find(p => p.name === node?.type)?.isStat);
	const column = details?.cell?.column ?? details?.header;
	const value = details?.cell?.value;
	const rowId = details?.cell?.id;
	const averages = details?.averages;

	return <>
		{averages && <>
			<button onClick={() => copyAverages(averages, 'row')}>Copy {averages?.label}</button>
			<button onClick={() => copyAverages(averages, 'col')}>Copy column averages</button>
			<button onClick={() => copyAverages(averages, 'all')}>Copy all averages</button>
			<div className='separator'/>
		</>}
		<button onClick={() => dispatchCustomEvent('action+openColumnsSelector')}>Select columns</button>
		{rowId != null && params.hideHeader && <Checkbox text='Hide table head' k='hideHeader'/>}
		<div className='separator'/>
		{rowId != null && <>
			<button onClick={() => setPlotId(() => rowId)}>Plot this event</button>
			<div className='separator'/>
		</>}
		{rowId == null && <button onClick={() => queryClient.refetchQueries()}>Reload table</button>}
		{rowId == null && <button onClick={openContextMenu('tableExport', undefined, true)}>Export table</button>}
		{!column && role && <>
			<button onClick={() => dispatchCustomEvent('action+openImportMenu')}>Import table</button>
			<button onClick={() => dispatchCustomEvent('computeAll')}>Recompute everything</button>
		</>}
		{column && <>
			{role && rowId != null && <button onClick={() => dispatchCustomEvent('computeRow', { id: rowId })}>Recompute row</button>}
			{column.isComputed && role &&
				<button onClick={() => dispatchCustomEvent('computeColumn', { column })}>Recompute column</button>}
			<button onClick={() => toggleSort(column.id, 1)}>Sort ascending</button>
			<button onClick={() => toggleSort(column.id, -1)}>Sort descening</button>
			{statsPresent && <><button onClick={() => setStatColumn(column, 0)}>Use as X</button>
				<button onClick={() => setStatColumn(column, 1)}>Use as Y</button></>}
			{value !== undefined && <button style={{ maxWidth: 232 }} onClick={() => addFilter(column, value)}
			>Filter {column.fullName} {defaultFilterOp(column, value)} {valueToString(value)}</button>}
		</>}
		{rowId == null && <><div className='separator'/><div className='Group'>
			<EventsCheckbox text='Show include markers' k='showIncludeMarkers'/>
			<Checkbox text='Show column averages' k='showAverages'/>
			<Checkbox text='Show changes log' k='showChangelog'/>
			<Checkbox text='Hide table head' k='hideHeader'/>
		</div></>}
	</>;
}

export const FeidTable = {
	name: 'FEID Table',
	Menu,
	Panel,
	defaultParams
};