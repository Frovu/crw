import '../css/Table.css';
import React, { useState, createContext, useContext, useMemo, useRef, SetStateAction } from 'react';
import { useQuery } from 'react-query';
import { useEventListener, usePersistedState, useSize } from '../util';
import { Sample, SampleState, TableSampleInput, sampleEditingMarkers } from './Sample';
import { Menu } from './TableMenu';
import TableView from './TableView';
import { PlotCircles } from '../plots/Circles';
import PlotGSM from '../plots/GSM';
import PlotIMF from '../plots/IMF';
import PlotSW from '../plots/SW';
import PlotGeoMagn from '../plots/Geomagn';
import HistogramPlot from '../plots/Histogram';
import { CorrParams, defaultCorrParams, defaultHistOptions, HistOptions } from './Statistics';
import CorrelationPlot from '../plots/Correlate';
import PlotGSMAnisotropy from '../plots/GSMAnisotropy';

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
	generic?: {
		id: number,
		entity: string,
		type: string,
		series: string,
		poi: string,
		shift: number
	} 
};
export type Sort = { column: string, direction: 1 | -1 };
export type Cursor = { row: number, column: number, editing?: boolean } | null;
export const plotTypes = [ 'Histogram', 'Correlation', 'Ring of Stations', 'Solar Wind', 'Cosmic Rays', 'CR Anisotropy', 'SW + Plasma', 'CR + Geomagn' ] as const;
export const themeOptions = ['Dark', 'Bright', 'Monochrome'] as const;

export type Onset = { time: Date, type: string | null, secondary?: boolean };
export type MagneticCloud = { start: Date, end: Date };

export type Settings = {
	theme: typeof themeOptions[number],
	enabledColumns: string[],
	plotTimeOffset: [number, number], // as number of days
	plotGrid: boolean,
	plotMarkers: boolean,
	plotLegend: boolean,
	plotIndexAp: boolean,
	plotUseA0m: boolean,
	plotSubtractTrend: boolean,
	plotMaskGLE: boolean,
	plotAz: boolean,
	plotImfBz: boolean,
	plotImfBxBy: boolean,
	plotTempIdx: boolean,
	plotLeft?: typeof plotTypes[number],
	plotTop?: typeof plotTypes[number],
	plotBottom?: typeof plotTypes[number],
	plotBottomSize: number,
	plotsRightSize: number
};
type VolatileSettings = {
	hist: HistOptions,
	correlation: CorrParams,
	viewPlots: boolean
};

type ChangeValue = { id: number, column: ColumnDef, value: any };
export const TableContext = createContext<{ data: any[][], columns: ColumnDef[], firstTable: string, tables: string[], series: {[s: string]: string},
	changes: ChangeValue[], setChanges: (c: SetStateAction<ChangeValue[]>) => void }>({} as any);
export const SampleContext = createContext<{ data: any[][], sample: SampleState, samples: Sample[], isEditing: boolean,
	setEditing: (a: boolean) => void, setSample: (d: SetStateAction<SampleState>) => void, setData: (a: any[][]) => void }>({} as any);
export const DataContext = createContext<{ data: any[][], columns: ColumnDef[], markers: null | string[] }>({} as any);
export const TableViewContext = createContext<{ sort: Sort, cursor: Cursor, plotId: null | number,
	setSort: (s: SetStateAction<Sort>) => void, setCursor: (s: SetStateAction<Cursor>) => void,
	makeChange: (id: number, col: ColumnDef, val: any) => boolean }>({} as any);
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
		plotGrid: true,
		plotMarkers: true,
		plotLegend: false,
		plotUseA0m: true,
		plotSubtractTrend: true,
		plotAz: false,
		plotMaskGLE: true,
		plotIndexAp: false,
		plotImfBz: true,
		plotImfBxBy: false,
		plotTempIdx: false,
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
	if (!context && !['Histogram', 'Correlation'].includes(type))
		return null;

	const params = {
		useAp: settings.plotIndexAp,
		useTemperatureIndex: settings.plotTempIdx,
		showGrid: settings.plotGrid,
		showMarkers: settings.plotMarkers,
		showLegend: settings.plotLegend,
		subtractTrend: settings.plotSubtractTrend,
		maskGLE: settings.plotMaskGLE,
		useA0m: settings.plotUseA0m,
		showAz: settings.plotAz,
		showBz: settings.plotImfBz,
		showBxBy: settings.plotImfBxBy,
		...context!
	};
	const stretchTop = which === 'plotBottom' && !settings.plotTop && { gridRow: '1 / 3' };
	const boundRight = bound && { maxWidth: (100-settings.plotsRightSize) + '%' };
	return (
		<div className={which} style={{ overflow: 'clip', position: 'relative', border: '1px solid', ...boundRight, ...stretchTop }}>
			{type === 'CR Anisotropy' && <PlotGSMAnisotropy {...params}/>}
			{type === 'Histogram' && <HistogramPlot/>}
			{type === 'Correlation' && <CorrelationPlot/>}
			{type === 'Ring of Stations' && <PlotCircles params={params}/>}
			{type === 'Solar Wind' && <PlotIMF {...params}/>}
			{type === 'SW + Plasma' && <>
				<div style={{ height: '50%', position: 'relative' }}><PlotIMF {...params} paddingBottom={-4}/></div> 
				<div style={{ height: '50%', position: 'relative' }}><PlotSW {...params}/></div> 
			</>}
			{type === 'Cosmic Rays' && <PlotGSM {...params}/>}
			{type === 'CR + Geomagn' && <>
				<div style={{ height: '75%', position: 'relative' }}><PlotGSM {...params} paddingBottom={-4}/></div> 
				<div style={{ height: '25%', position: 'relative' }}><PlotGeoMagn {...params}/></div> 
			</>}
			{type === 'Ring of Stations' && <a style={{ backgroundColor: 'var(--color-bg)', position: 'absolute', top: 0, right: 4 }} href='./ros' target='_blank'
				onClick={() => window.localStorage.setItem('plotRefParams', JSON.stringify(params))}>link</a>}
		</div>
	);
});

function CoreWrapper() {
	const { columns, data } = useContext(TableContext);
	const { sample, data: sampleData, isEditing: editingSample } = useContext(SampleContext);
	const { options, settings, set, setOpt } = useContext(SettingsContext);
	const [sort, setSort] = useState<Sort>({ column: 'fe_time', direction: 1 });
	const [plotIdx, setPlotIdx] = useState<number | null>(null);
	const [cursor, setCursor] = useState<Cursor>(null);

	const topDivRef = useRef<HTMLDivElement>(null);
	useSize(document.body);

	useEventListener('escape', () => setCursor(curs => curs?.editing ? { ...curs, editing: false } : null));

	const plotMove = (dir: -1 | 0 | 1) => () => setPlotIdx(current => {
		setOpt('viewPlots', true);
		if (dir !== 0)
			return current == null ? null : Math.max(0, Math.min(current + dir, data.length - 1));
		if (cursor)
			return data.findIndex(r => r[0] === dataContext.data[cursor.row][0]);
		if (!current) return null;
		const found = dataContext.data.findIndex(r => r[0] === data[current][0]);
		if (found >= 0)
			setCursor({ row: found, column: 0 });
		return current;
	});
	useEventListener('action+plot', plotMove(0));
	useEventListener('action+plotPrev', plotMove(-1));
	useEventListener('action+plotNext', plotMove(+1));
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

	// I did not know any prettier way to do this
	document.documentElement.setAttribute('main-theme', settings.theme);
	
	// dataContext.data[i][0] should be an unique id
	const dataContext = useMemo(() => {
		console.log('%ccompute table', 'color: magenta');
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
		return {
			data: idxs.map(i => renderedData[i]),
			markers: markers && idxs.map(i => markers[i]),
			columns: cols
		};
	}, [columns, settings.enabledColumns, sort, sampleData, sample, editingSample]);

	const plotContext = useMemo(() => {
		if (plotIdx == null) return null;
		const [timeIdx, onsIdx, cloudTime, cloudDur] = ['fe_time', 'fe_onset_type', 'mc_time', 'mc_duration'].map(c => columns.findIndex(cc => cc.id === c));
		const plotDate = data[plotIdx][timeIdx];
		const interval = settings.plotTimeOffset.map(days => plotDate.getTime() + days * 864e5);
		const rows = data.slice(Math.max(0, plotIdx - 4), Math.min(data.length, plotIdx + 6));
		const onsets = rows.filter(r => interval[0] < r[timeIdx] && r[timeIdx] < interval[1])
			.map(r => ({ time: r[timeIdx], type: r[onsIdx] || null, secondary: r[0] !== data[plotIdx][0] }) as Onset);
		const clouds = rows.map(r => {
			const time = r[cloudTime]?.getTime(), dur = r[cloudDur];
			if (!time || !dur) return null;
			if (time + dur * 36e5 < interval[0] || interval[1] < time)
				return null;
			const start = new Date(Math.max(interval[0], time));
			const end = new Date(Math.min(interval[1], time + dur * 36e5));
			return { start, end };
		}).filter((v): v is MagneticCloud => v != null);
		return { interval: interval.map(t => new Date(t)) as [Date, Date], onsets, clouds };
	}, [data, columns, plotIdx, settings]);

	const viewSize = Math.max(4, Math.round(
		(window.innerHeight - (topDivRef.current?.offsetHeight || 34)
		- (options.viewPlots && settings.plotLeft ? window.innerWidth*(100-settings.plotsRightSize)/100 *3/4 : 64)
		- 72) / 28 - 2 ));
	const shown = (s?: string) => s && options.viewPlots && (plotIdx != null || ['Histogram', 'Correlation'].includes(s));
	const blockMode = !shown(settings.plotTop) && !shown(settings.plotBottom);

	const tableViewContext = useMemo(() => {
		return {
			sort, setSort, cursor, setCursor, plotId: plotIdx && data[plotIdx][0],
			makeChange: (id: number, column: ColumnDef, value: any) => {
				const row = data.find(r => r[0] === id);
				// FIXME: create entity if not exists
				const entityExists = row && columns.some((c, i) => c.table === column.table && row[i] != null);
				if (!entityExists) return false;
				return true;
			}
		};
	}, [sort, setSort, cursor, setCursor, plotIdx, data, columns]);

	return (
		<DataContext.Provider value={dataContext}> 
			<PlotContext.Provider value={plotContext}>
				<TableViewContext.Provider value={tableViewContext}>
					<div className='TableApp' style={{ gridTemplateColumns: `minmax(480px, ${100-settings.plotsRightSize || 50}fr) ${settings.plotsRightSize || 50}fr`,
						...(blockMode && { display: 'block' }) }}>
						<div className='AppColumn'>
							<div ref={topDivRef}>
								<Menu/>
								<TableSampleInput {...{
									cursorColumn: cursor && dataContext.columns[cursor?.column],
									cursorValue: cursor && dataContext.data[cursor?.row]?.[cursor?.column+1] }}/>
							</div>
							<TableView {...{ viewSize, plotId: plotIdx && data[plotIdx][0] }}/>
							<PlotWrapper which='plotLeft' bound={blockMode && ['Histogram', 'Correlation'].includes(settings.plotLeft!)}/>
						</div>
						{!blockMode && <div className='AppColumn' style={{ gridTemplateRows: `${100-settings.plotBottomSize}% calc(${settings.plotBottomSize}% - 4px)` }}>
							<PlotWrapper which='plotTop'/>
							<PlotWrapper which='plotBottom'/>
						</div>}
					</div>
				</TableViewContext.Provider>
			</PlotContext.Provider>
		</DataContext.Provider>
	);
}

export function SampleWrapper() {
	const { data: tableData } = useContext(TableContext);
	const [data, setData] = useState<any[][]>(tableData);
	const [sample, setSample] = useState<SampleState>(null);
	const [isEditing, setEditing] = useState(false);

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

	if (query.isLoading)
		return <div>Loading samples info..</div>;
	if (!query.data)
		return <div>Failed to load samples info</div>;
	return (
		<SampleContext.Provider value={{ data, setData, sample, setSample, isEditing, setEditing, samples: query.data }}>
			<CoreWrapper/>
		</SampleContext.Provider>
	);
}

function SourceDataWrapper({ tables, columns, series, firstTable }:
{ tables: string[], columns: ColumnDef[], series: { [s: string]: string }, firstTable: string }) {
	const [changes, setChanges] = useState<ChangeValue[]>([]);
	const query = useQuery({
		cacheTime: 60 * 60 * 1000,
		staleTime: Infinity,
		queryKey: ['tableData'], 
		queryFn: async () => {
			const res = await fetch(`${process.env.REACT_APP_API}api/events/`, { credentials: 'include' });
			if (res.status !== 200)
				throw new Error('HTTP '+res.status);
			return await res.json() as {data: any[][], fields: string[]};
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
			firstTable,
			tables: Array.from(tables),
			series
		} as const;
	}, [tables, columns, firstTable, query.data, series]);
	const context = useMemo(() => {
		if (!rawContext) return null;
		const data = rawContext.data;
		for (const { id, column, value } of changes) {
			const row = data.find(r => r[0] === id);
			const columnIdx = rawContext.columns.findIndex(c => c.id === column.id);
			if (row) row[columnIdx] = value;
		}
		return {
			...rawContext,
			data,
			changes,
			setChanges
		};
	}, [rawContext, changes, setChanges]);

	if (query.isLoading)
		return <div>Loading data..</div>;
	if (!query.data)
		return <div>Failed to load data</div>;

	return (
		<TableContext.Provider value={context!}>
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

	useEventListener('action+resetSettings', () => setSettings(defaultSettings()));

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