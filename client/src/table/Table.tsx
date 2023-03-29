import '../css/Table.css';
import React, { useState, createContext, useContext, useMemo, useRef } from 'react';
import { useQuery } from 'react-query';
import { useEventListener, usePersistedState, useSize } from '../util';
import { TableSampleInput } from './Sample';
import { Menu } from './TableMenu';
import TableView from './TableView';
import { PlotCircles } from '../plots/Circles';
import PlotGSM from '../plots/GSM';
import PlotIMF from '../plots/IMF';
import PlotSW from '../plots/SW';
import PlotGeoMagn from '../plots/Geomagn';
import HistogramPlot from '../plots/Hist';
import { defaultHistOptions, HistOptions } from './Histogram';
import CorrelationPlot from '../plots/Correlate';

export const prettyTable = (str: string) => str.split('_').map((s: string) => s.charAt(0).toUpperCase()+s.slice(1)).join(' ');

export type ColumnDef = {
	name: string,
	type: 'real' | 'integer' | 'text' | 'enum' | 'time',
	description?: string,
	enum?: string[],
	table: string,
	width: number,
	id: string,
	hidden?: boolean,
	user_generic_id?: number // eslint-disable-line
};
export type Sort = { column: string, direction: 1 | -1 };
export type Cursor = { row: number, column: number, editing?: boolean } | null;
export const plotTypes = [ 'Histogram', 'Correlation', 'Ring of Stations', 'Solar Wind', 'SW + Plasma', 'Cosmic Rays', 'CR + Geomagn' ] as const;
export const themeOptions = ['Dark', 'Bright', 'Monochrome'] as const;

export type Onset = { time: Date, type: string | null, secondary?: boolean };
export type MagneticCloud = { start: Date, end: Date };

export type CorrParams = {
	columnX: string,
	columnY: string,
	color: string,
	regression: boolean,
};
const defaultCorrParams = {
	columnX: 'b_max',
	columnY: 'bz_abs_max',
	color: 'magenta',
	regression: true,
};

export type Settings = {
	theme: typeof themeOptions[number],
	enabledColumns: string[],
	plotTimeOffset: [number, number], // as number of days
	plotGrid: boolean,
	plotMarkers: boolean,
	plotIndexAp: boolean,
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

export const TableContext = createContext<{ data: any[][], columns: ColumnDef[], firstTable: string, tables: string[], series: {[s: string]: string}, prettyColumn: (c: ColumnDef | string) => string }>({} as any);
export const DataContext = createContext<{ sample: any[][], data: any[][], columns: ColumnDef[] }>({} as any);
export const PlotContext = createContext<null | { interval: [Date, Date], onsets: Onset[], clouds: MagneticCloud[] }>({} as any);
type SettingsSetter = <T extends keyof Settings>(key: T, a: (s: Settings[T]) => Settings[T]) => void;
type OptionsSetter = <T extends keyof VolatileSettings>(key: T, a: (s: VolatileSettings[T]) => VolatileSettings[T]) => void;
export const SettingsContext = createContext<{ settings: Settings, set: SettingsSetter, options: VolatileSettings, setOptions: OptionsSetter }>({} as any);

function defaultSettings(columns: ColumnDef[]): Settings {
	const SHOW = ['time', 'onset_type', 'magnitude', 'v_max', 'bz_min', 'ap_max', 'axy_max', 'solar_sources_type', 'solar_sources_description'];
	return {
		theme: 'Dark',
		enabledColumns: SHOW,
		plotGrid: true,
		plotMarkers: false,
		plotAz: false,
		plotIndexAp: false,
		plotImfBz: true,
		plotImfBxBy: false,
		plotTempIdx: false,
		plotTimeOffset: [-2, 3],
		plotTop: 'SW + Plasma',
		plotBottom: 'CR + Geomagn',
		plotBottomSize: 45,
		plotsRightSize: 65
	};
}

const PlotWrapper = React.memo(({ which }: { which: 'plotLeft' | 'plotTop' | 'plotBottom' }) => {
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
		showAz: settings.plotAz,
		showBz: settings.plotImfBz,
		showBxBy: settings.plotImfBxBy,
		...context!
	};
	const stretchTop = which === 'plotBottom' && !settings.plotTop && { gridRow: '1 / 3' };
	return (
		<div className={which} style={{ overflow: 'clip', position: 'relative', border: '1px solid', ...stretchTop }}>
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
	const { data, columns } = useContext(TableContext);
	const [sample, setSample] = useState(data);
	const [settings, setSettings] = usePersistedState('tableColEnabled', () => defaultSettings(columns));
	const [options, setOptions] = useState<VolatileSettings>(() => ({
		hist: defaultHistOptions, viewPlots: false, correlation: defaultCorrParams }));
	const [sort, setSort] = useState<Sort>({ column: 'time', direction: 1 });
	const [plotIdx, setPlotIdx] = useState<number | null>(null);
	const [cursor, setCursor] = useState<Cursor>(null);

	const topDivRef = useRef<HTMLDivElement>(null);
	useSize(document.body);

	useEventListener('escape', () => setCursor(curs => curs?.editing ? { ...curs, editing: false } : null));
	useEventListener('action+resetSettings', () => setSettings(defaultSettings(columns)));

	const plotMove = (dir: -1 | 0 | 1) => () => setPlotIdx(current => {
		setOptions(opts => ({ ...opts, viewPlots: true }));
		if (!current || dir === 0)
			return cursor ? data.findIndex(r => r[0] === dataContext.data[cursor.row][0]) : null;
		return Math.max(0, Math.min(current + dir, data.length - 1));
	});
	useEventListener('action+plot', plotMove(0));
	useEventListener('action+plotPrev', plotMove(-1));
	useEventListener('action+plotNext', plotMove(+1));
	useEventListener('action+switchViewPlots', () => setOptions(opts => ({ ...opts, viewPlots: !opts.viewPlots })));
	useEventListener('action+switchTheme', () => 
		setSettings(opts => ({ ...opts, theme: themeOptions[(themeOptions.indexOf(opts.theme) + 1) % themeOptions.length] })));

	// I did not know any prettier way to do this
	document.documentElement.setAttribute('main-theme', settings.theme);
	
	// dataContext.data[i][0] should be an unique id
	const dataContext = useMemo(() => {
		setCursor(null);
		const cols = columns.filter(c => settings.enabledColumns.includes(c.id));
		const enabledIdxs = [0, ...cols.map(c => columns.findIndex(cc => cc.id === c.id))];
		const sortIdx = 1 + cols.findIndex(c => c.id === sort.column);
		const renderedData = sample.map(row => enabledIdxs.map(ci => row[ci]))
			.sort((ra, rb) => (ra[sortIdx] - rb[sortIdx]) * sort.direction);
		return { sample, data: renderedData, columns: cols };
	}, [sample, columns, settings.enabledColumns, sort]);

	const settingsContext = useMemo(() => {
		const set: SettingsSetter = (key, fn) => setSettings(sets => ({ ...sets, [key]: fn(sets[key]) }));
		const seto: OptionsSetter = (key, fn) => setOptions(sets => ({ ...sets, [key]: fn(sets[key]) }));
		return { settings, set, options, setOptions: seto };
	}, [options, settings, setSettings]);

	const plotContext = useMemo(() => {
		if (!plotIdx) return null;
		const [timeIdx, onsIdx, cloudTime, cloudDur] = ['time', 'onset_type', 'magnetic_clouds_time', 'magnetic_clouds_duration'].map(c => Object.keys(columns).indexOf(c));
		const plotDate = plotIdx && data[plotIdx][timeIdx];
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
		- 72) / 28 - 1 ));

	return (
		<SettingsContext.Provider value={settingsContext}>
			<DataContext.Provider value={dataContext}>
				<PlotContext.Provider value={plotContext}>
					<div className='TableApp' style={{ gridTemplateColumns: `minmax(480px, ${100-settings.plotsRightSize || 50}fr) ${settings.plotsRightSize || 50}fr`,
						...(!options.viewPlots && { display: 'block' }) }}>
						<div className='AppColumn'>
							<div ref={topDivRef}>
								<Menu/>
								<TableSampleInput {...{
									cursorColumn: cursor && dataContext.columns[cursor?.column],
									cursorValue: cursor && dataContext.data[cursor?.row]?.[cursor?.column+1],
									setSample }}/>
							</div>
							<TableView {...{ viewSize, sort, setSort, cursor, setCursor, plotId: plotIdx && data[plotIdx][0] }}/>
							<PlotWrapper which='plotLeft'/>
						</div>
						<div className='AppColumn' style={{ gridTemplateRows: `${100-settings.plotBottomSize}% calc(${settings.plotBottomSize}% - 4px)` }}>
							<PlotWrapper which='plotTop'/>
							<PlotWrapper which='plotBottom'/>
						</div>
					</div>
				</PlotContext.Provider>
			</DataContext.Provider>
		</SettingsContext.Provider>
	);
}

function SourceDataWrapper({ tables, columns, series, firstTable }:
{ tables: string[], columns: ColumnDef[], series: { [s: string]: string }, firstTable: string }) {
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
	const context = useMemo(() => {
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
		console.log('rendered table', query.data.fields, data);
		const prettyColumn = (arg: ColumnDef | string) => {
			const col = typeof arg === 'string' ? columns.find(c => c.id === arg) : arg;
			if (!col) return '!unknown!';
			return col.name + (col.table !== firstTable ? ' of ' + prettyTable(col.table).replace(/([A-Z])[a-z ]+/g, '$1') : '');
		};
		return {
			data: data,
			columns: filtered,
			firstTable,
			tables: Array.from(tables),
			series,
			prettyColumn
		} as const;
	}, [tables, columns, firstTable, query.data, series]);
	if (query.isLoading)
		return <div>Loading data..</div>;
	if (!query.data)
		return <div>Failed to load data</div>;

	return (
		<TableContext.Provider value={context!}>
			<CoreWrapper/>
		</TableContext.Provider>
	);
}

export default function TableWrapper() {
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

			const columns = Object.entries(tables).flatMap(([table, cols]) => Object.entries(cols).map(([name, desc]) => {
				const width = (()=>{
					switch (desc.type) {
						case 'enum': return Math.max(5, ...(desc.enum!.map(el => el.length)));
						case 'time': return 19;
						case 'text': return 14;
						default: return 5;
					}
				})();
				return { ...desc, table, width, id: name };
			}).sort((a, b) => !a.name ? 0 : a.name.localeCompare(b.name))
				.sort((a, b) => a.id.includes('time') ? -1 : 1 )
				.sort((a, b) => a.id.startsWith('g_') ? (b.id.startsWith('g_') ? 0 : 1) : -1));
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
	return <SourceDataWrapper {...{ ...query.data, firstTable }}/>;
}