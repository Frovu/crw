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
import { HistogramPlot } from './Histogram';

export const prettyName = (str: string) => str.split('_').map((s: string) => s.charAt(0).toUpperCase()+s.slice(1)).join(' ');

export type ColumnDef = {
	name: string,
	type: 'real' | 'integer' | 'text' | 'enum' | 'time',
	description?: string,
	enum?: string[],
	table: string,
	width: number,
	id: string,
	hidden?: boolean
};
export type Columns = { [id: string]: ColumnDef };
export type Sort = { column: string, direction: 1 | -1 };
export type Cursor = { row: number, column: number, editing?: boolean } | null;
export const plotTypes = [ 'Histogram', 'Ring of Stations', 'Solar Wind', 'SW + Plasma', 'Cosmic Rays', 'CR + Geomagn' ] as const;

export type Onset = { time: Date, type: string | null, secondary?: boolean };
export type MagneticCloud = { start: Date, end: Date };

export type Settings = {
	enabledColumns: string[],
	plotTimeOffset: [number, number], // as number of days
	plotIndexAp: boolean,
	plotAz: boolean,
	plotImfBz: boolean,
	plotImfBxBy: boolean,
	plotLeft?: typeof plotTypes[number],
	plotTop?: typeof plotTypes[number],
	plotBottom?: typeof plotTypes[number],
	plotBottomSize: number,
	plotsRightSize: number
};

export const TableContext = createContext<{ data: any[][], columns: Columns, fisrtTable?: string }>({} as any);
export const DataContext = createContext<{ sample: any[][], data: any[][], columns: ColumnDef[] }>({} as any);
export const PlotContext = createContext<null | { interval: [Date, Date], onsets: Onset[], clouds: MagneticCloud[] }>({} as any);
type SettingsSetter = <T extends keyof Settings>(key: T, a: (s: Settings[T]) => Settings[T]) => void;
export const SettingsContext = createContext<{ settings: Settings, set: SettingsSetter }>({} as any);

function defaultSettings(columns: Columns): Settings {
	const SHOW = ['time', 'onset_type', 'magnitude', 'v_max', 'h_max', 'bz_min', 'ap_max', 'dst_max', 'axy_max', 'solar_sources_type', 'solar_sources_description'];
	const enabledColumns = Object.values(columns).filter(col => SHOW.includes(col.id)).map(col => col.id);
	return {
		enabledColumns,
		plotAz: false,
		plotIndexAp: false,
		plotImfBz: true,
		plotImfBxBy: false,
		plotTimeOffset: [-2, 3],
		plotTop: 'Cosmic Rays',
		plotBottom: 'Solar Wind',
		plotBottomSize: 40,
		plotsRightSize: 65
	};
}

const PlotWrapper = React.memo(({ which }: { which: 'plotLeft' | 'plotTop' | 'plotBottom' }) => {
	const { settings } = useContext(SettingsContext);
	const context = useContext(PlotContext);
	const type = settings[which];
	if (!type || !context) return null;
	const params = {
		useAp: settings.plotIndexAp,
		showAz: settings.plotAz,
		showBz: settings.plotImfBz,
		showBxBy: settings.plotImfBxBy,
		...context!
	};
	const stretchTop = which === 'plotBottom' && !settings.plotTop && { gridRow: '1 / 3' };
	return (
		<div className={which} style={{ overflow: 'clip', position: 'relative', border: '1px solid', ...stretchTop }}>
			{type === 'Histogram' && <HistogramPlot/>}
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
	const [sort, setSort] = useState<Sort>({ column: 'time', direction: 1 });
	const [plotIdx, setPlotIdx] = useState<number | null>(null);
	const [cursor, setCursor] = useState<Cursor>(null);

	const topDivRef = useRef<HTMLDivElement>(null);
	useSize(document.body);

	useEventListener('escape', () => setCursor(curs => curs?.editing ? { ...curs, editing: false } : null));
	useEventListener('action+resetSettings', () => setSettings(defaultSettings(columns)));
	useEventListener('action+plot', () => cursor &&
		setPlotIdx(data.findIndex(r => r[0] === dataContext.data[cursor.row][0])));

	const plotMove = (dir: -1 | 1) => () => setPlotIdx(current => {
		if (!current)
			return cursor ? data.findIndex(r => r[0] === dataContext.data[cursor.row][0]) : null;
		return Math.max(0, Math.min(current + dir, data.length - 1));
	});
	useEventListener('action+plotPrev', plotMove(-1));
	useEventListener('action+plotNext', plotMove(+1));

	// dataContext.data[i][0] should be an unique id
	const dataContext = useMemo(() => {
		setCursor(null);
		const cols = settings.enabledColumns.filter(n => !!columns[n]);
		const enabledIdxs = [0, ...cols.map(c => Object.keys(columns).indexOf(c))];
		const sortIdx = 1 + cols.indexOf(sort.column);
		const renderedData = sample.map(row => enabledIdxs.map(ci => row[ci]))
			.sort((ra, rb) => (ra[sortIdx] - rb[sortIdx]) * sort.direction);
		return { sample, data: renderedData, columns: cols.map(id => columns[id]) };
	}, [sample, columns, settings.enabledColumns, sort]);

	const settingsContext = useMemo(() => {
		const set: SettingsSetter = (key, fn) => setSettings(sets => ({ ...sets, [key]: fn(sets[key]) }));
		return { settings, set };
	}, [settings, setSettings]);

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

	const plotsMode = plotIdx && (settings.plotTop || settings.plotLeft || settings.plotBottom);
	const viewSize = Math.max(4, Math.round(
		(window.innerHeight - (topDivRef.current?.offsetHeight || 34)
		- (plotIdx && settings.plotLeft ? window.innerWidth*(100-settings.plotsRightSize)/100 *3/4 : 64)
		- 72) / 28 - 1 ));

	return (
		<SettingsContext.Provider value={settingsContext}>
			<DataContext.Provider value={dataContext}>
				<PlotContext.Provider value={plotContext}>
					<div className='TableApp' style={{ gridTemplateColumns: `minmax(480px, ${100-settings.plotsRightSize || 50}fr) ${settings.plotsRightSize || 50}fr`,
						 ...(!plotsMode && { display: 'block' }) }}>
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

function SourceDataWrapper({ columns, table }: { columns: Columns, table: string }) {
	const query = useQuery({
		cacheTime: 60 * 60 * 1000,
		staleTime: Infinity,
		queryKey: ['tableData'], 
		queryFn: async () => {
			const res = await fetch(`${process.env.REACT_APP_API}api/events/`, { credentials: 'include' });
			if (res.status !== 200)
				throw new Error('HTTP '+res.status);
			const resp: {data: any[][], fields: string[]} = await res.json();
			if (!resp?.data.length)
				return null;
			const orderedColumns = Object.fromEntries(resp.fields.map(f => [f, columns[f]]));
			for (const [i, col] of Object.values(orderedColumns).entries()) {
				if (col.type === 'time') {
					for (const row of resp.data) {
						if (row[i] === null) continue;
						const date = new Date(parseInt(row[i]) * 1e3);
						row[i] = isNaN(date as any) ? null : date;
					}
				}
			}
			return { data: resp.data, columns: orderedColumns, fisrtTable: table } as const;
		}
	});
	if (query.isLoading)
		return <div>Loading data..</div>;
	if (!query.data)
		return <div>Failed to load data</div>;
	return (
		<TableContext.Provider value={query.data}>
			<CoreWrapper/>
		</TableContext.Provider>
	);
}

export default function TableWrapper() {
	const query = useQuery({
		cacheTime: 60 * 60 * 1000,
		staleTime: Infinity,
		queryKey: ['tableStructure'],
		queryFn: async () => {
			const res = await fetch(`${process.env.REACT_APP_API}api/events/info/`, { credentials: 'include' });
			if (res.status !== 200)
				throw new Error('HTTP '+res.status);
			const tables: { [name: string]: { [name: string]: ColumnDef } } = await res.json();
			const columns = Object.fromEntries(
				Object.entries(tables).map(([table, cols]) => Object.entries(cols).map(([name, desc]) => {
					const width = (()=>{
						switch (desc.type) {
							case 'enum': return Math.max(5, ...(desc.enum!.map(el => el.length)));
							case 'time': return 19;
							case 'text': return 14;
							default: return 5;
						}
					})();
					return [name, { ...desc, table, width, id: name }];
				})).flat());
			return { id: { id: 'id', hidden: true }, ...columns } as Columns;
		}
	});
	if (query.isLoading)
		return <div>Loading tables..</div>;
	if (!query.data)
		return <div>Failed to load tables</div>;
	return <SourceDataWrapper columns={query.data} table={'forbush_effects'}/>;
}