import '../css/Table.css';
import React, { useState, createContext, useContext, useMemo, useRef, SetStateAction } from 'react';
import { useQuery } from 'react-query';
import { clamp, useEventListener, useMutationHandler, usePersistedState, useSize } from '../util';
import { Filter, Sample, SampleState, TableSampleInput, applySample, renderFilters, sampleEditingMarkers } from './Sample';
import { ConfirmationPopup, Menu } from './TableMenu';
import TableView from './TableView';
import { CirclesParams, PlotCircles } from '../plots/time/Circles';
import PlotGSM, { GSMParams } from '../plots/time/GSM';
import PlotIMF, { IMFParams } from '../plots/time/IMF';
import PlotSW, { SWParams } from '../plots/time/SW';
import PlotGeoMagn, { GeomagnParams } from '../plots/time/Geomagn';
import CorrelationPlot from '../plots/Correlate';
import EpochCollision from '../plots/EpochCollision';
import PlotExportView from './ExportPlot';
import HistogramPlot from '../plots/Histogram';
import { CorrParams, defaultCorrParams, defaultHistOptions, HistOptions } from './Statistics';

export const prettyTable = (str: string) => str.split('_').map((s: string) => s.charAt(0).toUpperCase()+s.slice(1)).join(' ');

export type ColumnDef = {
	name: string,
	fullName: string,
	type: 'real' | 'integer' | 'text' | 'enum' | 'time',
	description?: string,
	enum?: string[],
	table: string,
	width: number,
	id: string,
	hidden?: boolean,
	isComputed: boolean,
	generic?: {
		id: number,
		entity: string,
		type: string,
		series: string,
		poi: string,
		shift: number
	},
	parseName: null | string,
	parseValue: null | { [key: string|number]: string|number|null }
};
export type Sort = { column: string, direction: 1 | -1 };
export type Cursor = { row: number, column: number, editing?: boolean } | null;
export const samplePlotTypes = [ 'Histogram', 'Correlation', 'Epoch collision' ] as const;
export const plotTypes = [ 'CR + Geomagn', 'SW + Plasma', 'Ring of Stations', 'SW', 'CR', ...samplePlotTypes ] as const;
export const themeOptions = ['Dark', 'Bright', 'Monochrome'] as const;

export type Onset = { time: Date, type: string | null, secondary?: boolean };
export type MagneticCloud = { start: Date, end: Date };
export type ChangeLog = {
	[id: string]: {
		[col: string]: [
			{
				time: number,
				author: string,
				old: string,
				new: string
			}
		]
	}};

export type Settings = {
	theme: typeof themeOptions[number],
	enabledColumns: string[],
	computeAverages: boolean,
	showChangelog: boolean,
	plotOnlyShownEvents: boolean,
	plotTimeOffset: [number, number], // as number of days
	plotLeft: typeof plotTypes[number] | null,
	plotTop: typeof plotTypes[number] | null,
	plotBottom: typeof plotTypes[number] | null,
	plotBottomSize: number,
	plotsRightSize: number,
	plotParams: Omit<GSMParams & SWParams & IMFParams & CirclesParams & GeomagnParams, 'interval'|'showTimeAxis'|'showMetaInfo'|'transformText'>,
};
type VolatileSettings = {
	hist: HistOptions,
	correlation: CorrParams,
	viewPlots: boolean
};

type FiltersCollection = { filter: Filter, id: number }[];
type ChangeValue = { id: number, column: ColumnDef, value: any };
export const TableContext = createContext<{ data: any[][], columns: ColumnDef[], firstTable: string, tables: string[], series: {[s: string]: string},
	changelog?: ChangeLog, changes: ChangeValue[], makeChange: (c: ChangeValue) => boolean }>({} as any);
export const SampleContext = createContext<{ data: any[][], sample: SampleState, samples: Sample[], isEditing: boolean,
	setEditing: (a: boolean) => void, setSample: (d: SetStateAction<SampleState>) => void,
	filters: FiltersCollection, setFilters: (a: SetStateAction<FiltersCollection>) => void }>({} as any);
export const DataContext = createContext<{ data: any[][], columns: ColumnDef[], averages: null | (null | number[])[], markers: null | string[] }>({} as any);
export const TableViewContext = createContext<{ sort: Sort, cursor: Cursor, plotId: null | number,
	setSort: (s: SetStateAction<Sort>) => void, setCursor: (s: SetStateAction<Cursor>) => void}>({} as any);
export const PlotContext = createContext<null | { interval: [Date, Date], onsets: Onset[], clouds: MagneticCloud[] }>({} as any);
type SettingsSetter = <T extends keyof Settings>(key: T, a: SetStateAction<Settings[T]>) => void;
type OptionsSetter = <T extends keyof VolatileSettings>(key: T, a: SetStateAction<VolatileSettings[T]>) => void;
export const SettingsContext = createContext<{ settings: Settings, set: SettingsSetter, options: VolatileSettings, setOpt: OptionsSetter }>({} as any);

export function parseColumnValue(val: string, column: ColumnDef) {
	switch (column.type) {
		case 'time': return new Date(val.includes(' ') ? val.replace(' ', 'T')+'Z' : val);
		case 'real': return parseFloat(val);
		case 'integer': return parseInt(val);
		default: return val;
	}
}

export function valueToString(v: any) {
	if (v instanceof Date)
		return v.toISOString().replace(/\..+/, '').replace('T', ' ');
	if (typeof v === 'number')
		return parseFloat(v.toFixed(Math.max(0, 3 - v.toFixed(0).length))).toString();
	return v?.toString() ?? '';
}

export function isValidColumnValue(val: any, column: ColumnDef) {
	switch (column.type) {
		case 'time': return !isNaN(val as any);
		case 'real':
		case 'integer': return !isNaN(val as number);
		case 'enum': return column.enum?.includes(val as string);
		default: return (val as string).length > 0;
	}
}

function defaultSettings(): Settings {
	const SHOW = ['fe_time', 'fe_onset_type', 'fe_magnitude', 'fe_v_max', 'fe_v_before', 'fe_bz_min', 'fe_kp_max', 'fe_axy_max', 'ss_type', 'ss_description', 'ss_confidence'];
	return {
		theme: 'Dark',
		enabledColumns: SHOW,
		computeAverages: true,
		showChangelog: false,
		plotParams: {
			showGrid: true,
			showMarkers: true,
			showLegend: false,
			useA0m: true,
			subtractTrend: true,
			showAz: true,
			showAxy: true,
			showAxyVector: false,
			showBeta: true,
			maskGLE: true,
			useAp: false,
			showBz: true,
			showBxBy: false,
			useTemperatureIndex: false,

		},
		plotOnlyShownEvents: false,
		plotTimeOffset: [-2, 3],
		plotTop: 'SW + Plasma',
		plotLeft: 'Correlation',
		plotBottom: 'CR + Geomagn',
		plotBottomSize: 45,
		plotsRightSize: 65
	};
}

const PlotWrapper = React.memo(({ which, bound }: { which: 'plotLeft' | 'plotTop' | 'plotBottom', bound?: boolean }) => {
	const { settings, options } = useContext(SettingsContext);
	const context = useContext(PlotContext);
	const type = settings[which];
	if (!type || !options.viewPlots)
		return null;
	if (!context && !samplePlotTypes.includes(type as any))
		return null;

	const params = {
		...settings.plotParams,
		...context!,
		theme: settings.theme,
		stretch: true,
		showTimeAxis: true,
		showMetaInfo: true
	};

	const stretchTop = which === 'plotBottom' && !settings.plotTop && { gridRow: '1 / 3' };
	const boundRight = bound && { maxWidth: (100-settings.plotsRightSize) + '%' };
	return (
		<div className={which} style={{ overflow: 'clip', position: 'relative', border: '1px var(--color-border) solid', ...boundRight, ...stretchTop }}>
			{type === 'Histogram' && <HistogramPlot/>}
			{type === 'Correlation' && <CorrelationPlot/>}
			{type === 'Epoch collision' && <EpochCollision/>}
			{type === 'Ring of Stations' && <>
				<PlotCircles {...params}/>
				<a style={{ backgroundColor: 'var(--color-bg)', position: 'absolute', top: 0, right: 4 }}
					href='./ros' target='_blank' onClick={() => window.localStorage.setItem('plotRefParams', JSON.stringify(params))}>link</a>
			</>}
			{type === 'SW' && <PlotIMF {...params}/>}
			{type === 'SW + Plasma' && <>
				<div style={{ height: '50%', position: 'relative' }}><PlotIMF {...params} showTimeAxis={false}/></div> 
				<div style={{ height: '50%', position: 'relative' }}><PlotSW {...params}/></div> 
			</>}
			{type === 'CR' && <PlotGSM {...params}/>}
			{type === 'CR + Geomagn' && <>
				<div style={{ height: '75%', position: 'relative' }}><PlotGSM {...params} showTimeAxis={false}/></div> 
				<div style={{ height: '25%', position: 'relative' }}><PlotGeoMagn {...params} /></div> 
			</>}
		</div>
	);
});

function CoreWrapper() {
	const { columns, data } = useContext(TableContext);
	const { sample, data: sampleData, isEditing: editingSample, setFilters } = useContext(SampleContext);
	const { options, settings, set, setOpt } = useContext(SettingsContext);
	const [sort, setSort] = useState<Sort>({ column: 'fe_time', direction: 1 });
	const [plotIdx, setPlotIdx] = useState<number | null>(null);
	const [cursor, setCursor] = useState<Cursor>(null);
	const [viewExport, setViewExport] = useState(false);

	const topDivRef = useRef<HTMLDivElement>(null);
	useSize(document.body);

	useEventListener('escape', () => setCursor(curs => curs?.editing ? { ...curs, editing: false } : null));

	const plotMove = (dir: -1 | 0 | 1, global?: boolean) => () => setPlotIdx(current => {
		if (dir === 0) { // set cursor to plotted line
			setOpt('viewPlots', true);
			if (cursor)
				return data.findIndex(r => r[0] === dataContext.data[cursor.row][0]);
			const found = dataContext.data.findIndex(r => r[0] === data[current!]?.[0]);
			if (found >= 0) setCursor({ row: found, column: 0 });
		}
		if (current == null)
			return null;
		if (global)
			return clamp(0, data.length - 1, current + dir);
		const shownData = dataContext.data;
		const found = shownData.findIndex(r => r[0] === data[current][0]);
		const curIdx = found >= 0 ? found : cursor?.row;
		if (curIdx == null) return current;
		const movedIdx = clamp(0, shownData.length - 1, curIdx + dir);
		return data.findIndex(r => r[0] === shownData[movedIdx][0]);
	});
	useEventListener('action+plot', plotMove(0));
	useEventListener('action+plotPrev', plotMove(-1, true));
	useEventListener('action+plotNext', plotMove(+1, true));
	useEventListener('action+plotPrevShown', plotMove(-1));
	useEventListener('action+plotNextShown', plotMove(+1));

	useEventListener('action+switchHistCorr', () => ['plotLeft', 'plotTop', 'plotBottom'].forEach(p => set(p as any, was =>
		was === 'Histogram' ? 'Correlation' : was === 'Correlation' ? 'Histogram' : was )));
	useEventListener('action+switchViewPlots', () => {
		if (plotIdx != null) return setPlotIdx(null);
		setOpt('viewPlots', view => !view);
	});
	useEventListener('action+switchTheme', () => 
		set('theme', theme => themeOptions[(themeOptions.indexOf(theme) + 1) % themeOptions.length]));

	useEventListener('setColumn', e => {
		const which = e.detail.which, column = e.detail.column.id;
		const corrKey = which === 1 ? 'columnX' : 'columnY';
		const histKey = 'column' + Math.min(which - 1, 2) as keyof HistOptions;
		setOpt('correlation', corr => ({ ...corr, [corrKey]: column }));
		setOpt('hist', corr => ({ ...corr, [histKey]: corr[histKey]  === column ? null : column }));
	});

	useEventListener('action+addFilter', () => setFilters(fltrs => {
		if (!cursor)
			return [...fltrs, { filter: { column: 'fe_magnitude', operation: '>=', value: '3' }, id: Date.now() }];
		const column =  dataContext.columns[cursor?.column];
		const val = dataContext.data[cursor?.row]?.[cursor?.column+1];
		const operation = val == null ? 'not null' : column.type === 'enum' ? '==' : column.type === 'text' ? 'regexp' : '>=';
		const value = (column.type === 'time' ? val?.toISOString().replace(/T.*/,'') : val?.toString()) ?? '';
		return [...fltrs, { filter: { column: column.id, operation, value }, id: Date.now() }];
	}));
	useEventListener('action+removeFilter', () => setFilters(fltrs => fltrs.slice(0, -1)));

	// I did not know any prettier way to do this
	document.documentElement.setAttribute('main-theme', settings.theme);
	
	// dataContext.data[i][0] should be an unique id
	const dataContext = useMemo(() => {
		console.time('compute table');
		const cols = columns.filter(c => settings.enabledColumns.includes(c.id));
		const enabledIdxs = [0, ...cols.map(c => columns.findIndex(cc => cc.id === c.id))];
		const sortIdx = 1 + cols.findIndex(c => c.id === (sort.column === '_sample' ? 'time' : sort.column ));
		const renderedData = sampleData.map(row => enabledIdxs.map(ci => row[ci]));
		const markers = editingSample && sample ? sampleEditingMarkers(sampleData, sample, columns) : null;
		const idxs = [...renderedData.keys()];
		idxs.sort((a, b) => (renderedData[a][sortIdx] - renderedData[b][sortIdx]) * sort.direction);
		if (markers && sort.column === '_sample') {
			const weights = { '  ': 0, 'f ': 1, ' +': 2, 'f+': 3, ' -': 4, 'f-': 5  } as any;
			idxs.sort((a, b) => ((weights[markers[a]] ?? 9) - (weights[markers[b]] ?? 9)) * sort.direction);
		}
		const averages = !settings.computeAverages ? null : cols.map((col, i) => {
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
	}, [columns, sort, sampleData, sample, editingSample, settings.enabledColumns, settings.computeAverages]);

	const plotContext = useMemo(() => {
		if (plotIdx == null) return null;
		const [timeIdx, onsIdx, cloudTime, cloudDur] = ['fe_time', 'fe_onset_type', 'mc_time', 'mc_duration'].map(c => columns.findIndex(cc => cc.id === c));
		const plotDate = data[plotIdx][timeIdx] as Date;
		const hour = Math.floor(plotDate.getTime() / 36e5) * 36e5;
		const interval = settings.plotTimeOffset.map(days => new Date(hour + days * 864e5));
		const allNeighbors = data.slice(Math.max(0, plotIdx - 4), Math.min(data.length, plotIdx + 4));
		const onsets = allNeighbors.filter(r => true)
			.map(r => ({ time: r[timeIdx], type: r[onsIdx] || null, secondary: r[0] !== data[plotIdx][0] }) as Onset);
		const clouds = allNeighbors.map(r => {
			const time = r[cloudTime]?.getTime(), dur = r[cloudDur];
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
	}, [data, columns, plotIdx, settings]);

	useEventListener('action+exportPlot', () => plotContext && setViewExport(true));

	const viewSize = Math.max(4, Math.round(
		(window.innerHeight - (topDivRef.current?.offsetHeight || 34)
		- (options.viewPlots && settings.plotLeft ? window.innerWidth*(100-settings.plotsRightSize)/100 *3/4 : 64)
		- 72) / 28 - 3 )); // FIXME: -3 gives space for long column header, there is a better way to do that
	const shown = (s: null | string) => s && options.viewPlots && (plotIdx != null || samplePlotTypes.includes(s as any));
	const blockMode = !shown(settings.plotTop) && !shown(settings.plotBottom);

	const tableViewContext = useMemo(() => {
		return {
			sort, setSort, cursor, setCursor, plotId: plotIdx && data[plotIdx][0]
		};
	}, [sort, setSort, cursor, setCursor, plotIdx, data]);

	return (
		<DataContext.Provider value={dataContext}> 
			<PlotContext.Provider value={plotContext}>
				<TableViewContext.Provider value={tableViewContext}>
					{viewExport && <PlotExportView escape={() => setViewExport(false)}/>}
					{!viewExport && <div className='TableApp' style={{ gridTemplateColumns: `minmax(480px, ${100-settings.plotsRightSize || 50}fr) ${settings.plotsRightSize || 50}fr`,
						...(blockMode && { display: 'block' }) }}>
						<div className='AppColumn'>
							<div ref={topDivRef}>
								<Menu/>
								<TableSampleInput/>
							</div>
							<TableView {...{ viewSize, plotId: plotIdx && data[plotIdx][0] }}/>
							<PlotWrapper which='plotLeft' bound={blockMode && samplePlotTypes.includes(settings.plotLeft as any)}/>
						</div>
						{!blockMode && <div className='AppColumn' style={{ gridTemplateRows: `${100-settings.plotBottomSize}% calc(${settings.plotBottomSize}% - 4px)` }}>
							<PlotWrapper which='plotTop'/>
							<PlotWrapper which='plotBottom'/>
						</div>}
					</div>}
				</TableViewContext.Provider>
			</PlotContext.Provider>
		</DataContext.Provider>
	);
}

export function SampleWrapper() {
	const { data: tableData, columns } = useContext(TableContext);
	const [sample, setSample] = useState<SampleState>(null);
	const [isEditing, setEditing] = useState(false);
	const [filters, setFilters] = useState<FiltersCollection>([]);
	
	useEventListener('sampleEdit', (e) => {
		if (!sample || !isEditing) return;
		const { action, id } = e.detail as { action: 'whitelist' | 'blacklist', id: number };
		const target = sample[action];
		const found = target.indexOf(id);
		const opposite = action === 'blacklist' ? 'whitelist' : 'blacklist';
		setSample(smpl => ({ ...smpl!,
			[action]: found < 0 ? target.concat(id) : target.filter(i => i !== id),
			[opposite]: sample[opposite].filter(i => i !== id)
		}));
	});

	const query = useQuery('samples', async () => {
		const res = await fetch(`${process.env.REACT_APP_API}api/events/samples`, { credentials: 'include' });
		const samples = (await res.json()).samples as Sample[];
		console.log('%cavailable samples:', 'color: #0f0', samples);
		if (sample && !samples.find(s => s.id === sample.id)) {
			setEditing(false);
			setSample(null);
		}
		return samples;
	});

	const data = useMemo(() => {
		console.time('compute sample');
		const applied = isEditing ? tableData.map(row => [...row]) : applySample(tableData, sample, columns);
		const filterFn = renderFilters(filters.map(f => f.filter), columns);
		const filtered = applied.filter(row => filterFn(row));
		console.timeEnd('compute sample');
		return filtered;
	}, [columns, filters, isEditing, sample, tableData]);

	if (query.isLoading)
		return <div>Loading samples info..</div>;
	if (!query.data)
		return <div>Failed to load samples info</div>;
	return (
		<SampleContext.Provider value={{ data, sample, setSample, isEditing, setEditing, filters, setFilters, samples: query.data }}>
			<CoreWrapper/>
		</SampleContext.Provider>
	);
}

function SourceDataWrapper({ tables, columns, series, firstTable }:
{ tables: string[], columns: ColumnDef[], series: { [s: string]: string }, firstTable: string }) {
	const [showCommit, setShowCommit] = useState(false);
	const [changes, setChanges] = useState<ChangeValue[]>([]);
	const query = useQuery({
		cacheTime: 60 * 60 * 1000,
		staleTime: Infinity,
		queryKey: ['tableData'], 
		queryFn: async () => {
			const res = await fetch(`${process.env.REACT_APP_API}api/events/?changelog=true`, { credentials: 'include' });
			if (res.status !== 200)
				throw new Error('HTTP '+res.status);
			return await res.json() as {data: any[][], fields: string[], changelog: ChangeLog};
		}
	});
	const rawContext = useMemo(() => {
		if (!query.data) return null;
		const fields = query.data.fields;
		const filtered = columns.filter(c => fields.includes(c.id));
		const indexes = filtered.map(c => fields.indexOf(c.id));
		const data = query.data.data.map((row: any[]) => indexes.map((i) => row[i]));
		for (const [i, col] of Object.values(filtered).entries()) {
			if (col.type === 'time') {
				for (const row of data) {
					if (row[i] === null) continue;
					const date = new Date(parseInt(row[i]) * 1e3);
					row[i] = isNaN(date as any) ? null : date;
				}
			}
		}
		console.log('%crendered table:', 'color: #0f0', query.data.fields, data);
		return {
			data: data,
			columns: filtered,
			changelog: query.data.changelog,
			firstTable,
			tables: Array.from(tables),
			series
		} as const;
	}, [tables, columns, firstTable, query.data, series]);

	const context = useMemo(() => {
		if (!rawContext) return null;
		const data = [...rawContext.data.map(r => [...r])];
		for (const { id, column, value } of changes) {
			const row = data.find(r => r[0] === id);
			const columnIdx = rawContext.columns.findIndex(c => c.id === column.id);
			if (row) row[columnIdx] = value;
		}
		const sortIdx = rawContext.columns.findIndex(c => c.name === 'time');
		if (sortIdx > 0) data.sort((a, b) => a[sortIdx] - b[sortIdx]);
		
		return {
			...rawContext,
			data,
			changes,
			makeChange: ({ id, column, value }: ChangeValue) => {
				const row = rawContext.data.find(r => r[0] === id);
				// FIXME: create entity if not exists
				const colIdx = columns.findIndex(c => c.id === column.id);
				const entityExists = row && columns.some((c, i) => c.table === column.table && row[i] != null);
				if (!entityExists) return false;
				
				const isDifferent = column.type === 'time' ? row[colIdx].getTime() !== value.getTime() : row[colIdx] !== value;
				setChanges(cgs => [...cgs.filter(c => c.id !== id || column.id !== c.column.id ),
					...(isDifferent ? [{ id, column, value }] : [])]);
				return true;
			}
		};
	}, [rawContext, changes, setChanges, columns]);

	useEventListener('action+commitChanges', () => setShowCommit(changes.length > 0));
	useEventListener('action+discardChanges', () => setChanges([]));

	const { mutate, report, color } = useMutationHandler(async () => {
		const res = await fetch(`${process.env.REACT_APP_API}api/events/changes`, {
			method: 'POST', credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				changes: changes.map(c => ({ ...c, entity: c.column.table, column: c.column.id }))
			}) 
		});
		if (res.status === 400)
			throw new Error(await res.text());
		if (res.status !== 200)
			throw new Error('HTTP '+res.status);
		return await res.text();
	}, ['tableData']);

	if (query.isLoading)
		return <div>Loading data..</div>;
	if (!query.data)
		return <div>Failed to load data</div>;
	return (
		<TableContext.Provider value={context!}>
			{showCommit && <ConfirmationPopup style={{ width: 'unset' }} confirm={() => mutate(null, {
				onSuccess: () => {
					setShowCommit(false);
					setChanges([]);
				}
			})} close={() => setShowCommit(false)} persistent={true}>
				<h4 style={{ margin: '1em 0 0 0' }}>About to commit {changes.length} change{changes.length > 1 ? 's' : ''}</h4>
				<div style={{ textAlign: 'left', padding: '1em 2em 1em 2em' }} onClick={e => e.stopPropagation()}>
					{changes.map(({ id, column, value }) => {
						const row = rawContext?.data.find(r => r[0] === id);
						const colIdx = columns.findIndex(c => c.id === column.id);
						const val0 = row?.[colIdx] == null ? 'null' : valueToString(row?.[colIdx]);
						const val1 = value == null ? 'null' : valueToString(value);
						return (<div key={id+column.id+value}>
							<span style={{ color: 'var(--color-text-dark)' }}>#{id}: </span>
							<i style={{ color: 'var(--color-active)' }}>{column.fullName}</i> {val0} -&gt; <b>{val1}</b>
							<span className='CloseButton' style={{ transform: 'translate(4px, 2px)' }} onClick={() => 
								setChanges(cgs => [...cgs.filter(c => c.id !== id || column.id !== c.column.id)])}>&times;</span>
						</div>);})}
				</div>
				<div style={{ height: '1em', color }}>{report?.error ?? report?.success}</div>
			</ConfirmationPopup>}
			<SampleWrapper/>
		</TableContext.Provider>
	);
}

export default function TableWrapper() {
	const [settings, setSettings] = usePersistedState('tableColEnabled', () => defaultSettings());
	const [options, setOptions] = useState<VolatileSettings>(() => ({
		hist: defaultHistOptions, viewPlots: false, correlation: defaultCorrParams }));
	const settingsContext = useMemo(() => {
		const set: SettingsSetter = (key, arg) => setSettings(sets => ({ ...sets, [key]: typeof arg === 'function' ? arg(sets[key]) : arg }));
		const setOpt: OptionsSetter = (key, arg) => setOptions(sets => ({ ...sets, [key]: typeof arg === 'function' ? arg(sets[key]) : arg }));
		return { settings, set, options, setOpt };
	}, [options, settings, setSettings]);

	useEventListener('action+resetSettings', () => {
		window.localStorage.removeItem('aidPlotExport');
		setSettings(defaultSettings());
	});

	const firstTable = 'forbush_effects';
	const query = useQuery({
		cacheTime: 60 * 60 * 1000,
		staleTime: Infinity,
		queryKey: ['tableStructure'],
		queryFn: async () => {
			const res = await fetch(`${process.env.REACT_APP_API}api/events/info/`, { credentials: 'include' });
			if (res.status !== 200)
				throw new Error('HTTP '+res.status);
			const json = await res.json();
			const tables: { [name: string]: { [name: string]: ColumnDef } } = json.tables;

			const columns = Object.entries(tables).flatMap(([table, cols]) => Object.entries(cols).map(([id, desc]) => {
				const width = (()=>{
					switch (desc.type) {
						case 'enum': return Math.max(5, ...(desc.enum!.map(el => el.length)));
						case 'time': return 19;
						case 'text': return 14;
						default: return 6; 
					}
				})();
				const fullName = desc.name + (table !== firstTable ? ' of ' + prettyTable(table).replace(/([A-Z])[a-z ]+/g, '$1') : '');
				return { ...desc, table, width, id,
					name: desc.name.length > 20 ? desc.name.slice(0, 20)+'..' : desc.name,
					fullName: fullName.length > 30 ? fullName.slice(0, 30)+'..' : fullName,
					description: desc.name.length > 20 ? (desc.description ? (fullName + '\n\n' + desc.description) : '') : desc.description
				} as ColumnDef;
			}) 	);
			
			console.log('%cavailable columns:', 'color: #0f0' , columns);
			return {
				tables: Object.keys(tables),
				columns: [ { id: 'id', hidden: true, table: firstTable } as ColumnDef, ...columns],
				series: json.series as { [s: string]: string }
			};
		}
	});
	if (query.isLoading)
		return <div>Loading tables..</div>;
	if (!query.data)
		return <div>Failed to load tables</div>;
	return (
		<SettingsContext.Provider value={settingsContext}>
			<SourceDataWrapper {...{ ...query.data, firstTable }}/>
		</SettingsContext.Provider>
	);
}