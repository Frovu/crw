import '../styles/Table.css';
import React, { useState, createContext, useContext, useMemo, useRef, SetStateAction } from 'react';
import { useQuery } from 'react-query';
import { apiGet, apiPost, clamp, useEventListener, useMutationHandler, usePersistedState, useSize } from '../util';
import { Filter, Sample, SampleState, TableSampleInput, applySample, renderFilters, sampleEditingMarkers } from './Sample';
import { ConfirmationPopup, Menu } from './TableMenu';
import TableView from './TableView';
import PlotCircles, { CirclesParams } from '../plots/time/Circles';
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
	nullable: boolean,
	table: string,
	width: number,
	id: string,
	sqlName: string, // not unique across tables
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

type Value = Date | string | number | null;
type FiltersCollection = { filter: Filter, id: number }[];
type ChangeValue = { id: number, column: ColumnDef, value: Value };
export const TableContext = createContext<{ data: Value[][], columns: ColumnDef[], firstTable: string, tables: string[], series: {[s: string]: string},
	changelog?: ChangeLog, changes: ChangeValue[], makeChange: (c: ChangeValue) => boolean }>({} as any);
export const SampleContext = createContext<{ data: Value[][], sample: SampleState, samples: Sample[], isEditing: boolean,
	setEditing: (a: boolean) => void, setSample: (d: SetStateAction<SampleState>) => void,
	filters: FiltersCollection, setFilters: (a: SetStateAction<FiltersCollection>) => void }>({} as any);
export const DataContext = createContext<{ data: Value[][], columns: ColumnDef[], averages: null | (null | number[])[], markers: null | string[] }>({} as any);
export const TableViewContext = createContext<{ sort: Sort, cursor: Cursor, plotId: null | number,
	setSort: (s: SetStateAction<Sort>) => void, setCursor: (s: SetStateAction<Cursor>) => void}>({} as any);
export const PlotContext = createContext<null | { interval: [Date, Date], onsets: Onset[], clouds: MagneticCloud[] }>({} as any);
type SettingsSetter = <T extends keyof Settings>(key: T, a: SetStateAction<Settings[T]>) => void;
type OptionsSetter = <T extends keyof VolatileSettings>(key: T, a: SetStateAction<VolatileSettings[T]>) => void;
export const SettingsContext = createContext<{ settings: Settings, set: SettingsSetter, options: VolatileSettings, setOpt: OptionsSetter }>({} as any);

export function equalValues(a: Value, b: Value) {
	return a instanceof Date ? (a as Date).getTime() === (b as Date|null)?.getTime() : a === b;
}

export function parseColumnValue(val: string, column: ColumnDef) {
	switch (column.type) {
		case 'time': return new Date(val.includes(' ') ? val.replace(' ', 'T')+'Z' : val);
		case 'real': return parseFloat(val);
		case 'integer': return parseInt(val);
		default: return val;
	}
}

export function valueToString(v: Value) {
	if (v instanceof Date)
		return v.toISOString().replace(/(:00)?\..+/, '').replace('T', ' ');
	if (typeof v === 'number')
		return parseFloat(v.toFixed(Math.max(0, 3 - v.toFixed(0).length))).toString();
	return v?.toString() ?? '';
}

export function isValidColumnValue(val: Value, column: ColumnDef) {
	if (val == null)
		return column.nullable;
	switch (column.type) {
		case 'time': return (val instanceof Date) && !isNaN(val.getTime());
		case 'real':
		case 'integer': return (typeof val == 'number') && !isNaN(val);
		case 'enum': return column.enum?.includes(val as string);
		default:
			return val !== '';
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
			rsmExtended: false,
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
				<PlotCircles {...{ params }}/>
				<a style={{ backgroundColor: 'var(--color-bg)', position: 'absolute', top: 0, right: 4 }}
					href='./ros' target='_blank' onClick={() => window.localStorage.setItem('plotRefParams', JSON.stringify(params))}>link</a>
			</>}
			{type === 'SW' && <PlotIMF {...{ params }}/>}
			{type === 'SW + Plasma' && <>
				<div style={{ height: '50%', position: 'relative' }}><PlotIMF params={{ ...params, showTimeAxis: false }} /></div> 
				<div style={{ height: '50%', position: 'relative' }}><PlotSW {...{ params }}/></div> 
			</>}
			{type === 'CR' && <PlotGSM {...{ params }}/>}
			{type === 'CR + Geomagn' && <>
				<div style={{ height: '75%', position: 'relative' }}><PlotGSM params={{ ...params, showTimeAxis: false }}/></div> 
				<div style={{ height: '25%', position: 'relative' }}><PlotGeoMagn {...{ params }} /></div> 
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
		const value = (val instanceof Date ? val.toISOString().replace(/T.*/,'') : val?.toString()) ?? '';
		return [...fltrs, { filter: { column: column.id, operation, value }, id: Date.now() }];
	}));
	useEventListener('action+removeFilter', () => setFilters(fltrs => fltrs.slice(0, -1)));

	// I did not know any prettier way to do this
	if (!viewExport)
		document.documentElement.setAttribute('main-theme', settings.theme);
	
	// dataContext.data[i][0] should be an unique id
	const dataContext = useMemo(() => {
		console.time('compute table');
		const cols = columns.filter(c => settings.enabledColumns.includes(c.id));
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
		const onsets = allNeighbors.filter(r => !viewExport || sampleData.find(sr => sr[0] === r[0]))
			.map(r => ({ time: r[timeIdx], type: r[onsIdx] || null, secondary: r[0] !== data[plotIdx][0] }) as Onset);
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
	}, [data, columns, plotIdx, settings, sampleData, viewExport]);

	useEventListener('action+exportPlot', () => plotContext && setViewExport(true));

	const viewSize = Math.max(4, Math.round(
		(window.innerHeight - (topDivRef.current?.offsetHeight || 34)
		- (options.viewPlots && settings.plotLeft ? window.innerWidth*(100-settings.plotsRightSize)/100 *3/4 : 64)
		- 72) / 28 - 3 )); // FIXME: -3 gives space for long column header, there is a better way to do that
	const shown = (s: null | string) => s && options.viewPlots && (plotIdx != null || samplePlotTypes.includes(s as any));
	const blockMode = !shown(settings.plotTop) && !shown(settings.plotBottom);

	const tableViewContext = useMemo(() => {
		return {
			sort, setSort, cursor, setCursor, plotId: plotIdx && data[plotIdx][0] as number
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
