import '../css/Table.css';
import { useState, createContext, useContext, useMemo } from 'react';
import { useQuery } from 'react-query';
import { useEventListener, usePersistedState } from '../util';
import { Filter, Menu } from './TableMenu';
import TableView from './TableCore';
import { PlotCircles } from '../plots/Circles';
import PlotGSM from '../plots/GSM';

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
export const plotTypes = [ 'Ring of Stations', 'Solar Wind', 'Cosmic Rays (GSM)' ] as const;

export type Settings = {
	enabledColumns: string[],
	plotTimeOffset: [number, number], // as number of days
	plotLeft?: typeof plotTypes[number],
	plotTop?: typeof plotTypes[number],
	plotBottom?: typeof plotTypes[number],
};

export const TableContext = createContext<{ data: any[][], columns: Columns, fisrtTable?: string }>({} as any);
export const DataContext = createContext<{ data: any[][], columns: ColumnDef[] }>({} as any);
type SettingsSetter = <T extends keyof Settings>(key: T, a: (s: Settings[T]) => Settings[T]) => void;
export const SettingsContext = createContext<{ settings: Settings, set: SettingsSetter }>({} as any);

function defaultSettings(columns: Columns): Settings {
	const SHOW = ['time', 'onset_type', 'magnitude', 'v_max', 'h_max', 'bz_min', 'ap_max', 'dst_max', 'axy_max', 'solar_sources_type', 'solar_sources_description'];
	const enabledColumns = Object.values(columns).filter(col => SHOW.includes(col.id)).map(col => col.id);
	return {
		enabledColumns,
		plotTimeOffset: [-2, 3],
		plotTop: 'Ring of Stations'
	};
}

function PlotWrapper({ which, date }: { which: 'plotLeft' | 'plotTop' | 'plotBottom', date: Date }) {
	const { settings } = useContext(SettingsContext);
	const type = settings[which];
	if (!type || !date) return null;
	const interval = settings.plotTimeOffset.map(days => new Date(date.getTime() + days * 864e5)) as [Date, Date];
	const stretchTop = which === 'plotTop' && !settings.plotBottom && { gridRow: '1 / 3' };
	const params = { interval, onset: date };
	return (
		<div className={which} style={{ position: 'relative', minHeight: 320, border: '1px solid', ...stretchTop }}>
			{type === 'Ring of Stations' && <PlotCircles interactive={false} params={params}/>}
			{type === 'Solar Wind' && <div style={{  backgroundColor: 'red' }}></div>}
			{type === 'Cosmic Rays (GSM)' && <PlotGSM {...params}/>}
			{type === 'Ring of Stations' && <a style={{ position: 'absolute', bottom: 8, left: 8 }} href='./ros' target='_blank'
				onClick={() => window.localStorage.setItem('plotRefParams', JSON.stringify(params))}>link</a>}
		</div>
	);
}

function CoreWrapper() {
	const { data, columns } = useContext(TableContext);
	const [filters, setFilters] = useState<Filter[]>([]);
	const [settings, setSettings] = usePersistedState('tableColEnabled', () => defaultSettings(columns));
	const [sort, setSort] = useState<Sort>({ column: 'time', direction: 1 });
	const [plotIdx, setPlotIdx] = useState<number | null>(null);
	const [cursor, setCursor] = useState<Cursor>(null);
	// const [changes, setChanges] = useState(new Map<number, number[]>());

	useEventListener('escape', () => setCursor(curs => curs?.editing ? { ...curs, editing: false } : null));
	useEventListener('action+addFilter', () => setFilters(fltrs => {
		if (!cursor)
			return [...fltrs, { column: 'magnitude', operation: '>=', input: '', id: Date.now() }];
		const column = dataContext.columns[cursor.column];
		const val = dataContext.data[cursor.row][cursor.column + 1];
		const operation = val == null ? 'is null' : column.type === 'enum' ? '==' : column.type === 'text' ? 'includes' : '>=';
		const input = (column.type === 'time' ? val?.toISOString().replace(/T.*/,'') : val?.toString()) ?? '';
		return [...fltrs, { column: column.id, operation, input, id: Date.now() }];
	}));
	useEventListener('action+removeFilter', () => setFilters(fltrs => fltrs.slice(0, -1)));
	useEventListener('action+resetSettings', () => setSettings(defaultSettings(columns)));
	useEventListener('action+plot', () => cursor &&
		setPlotIdx(data.findIndex(r => r[0] === dataContext.data[cursor.row][0])));

	// dataContext.data[i][0] should be an unique id
	const dataContext = useMemo(() => {
		setCursor(null);
		const cols = settings.enabledColumns;
		const enabledIdxs = [0, ...cols.map(c => Object.keys(columns).indexOf(c))];
		const sortIdx = cols.indexOf(sort.column);
		const filterFns = filters.map(fl => fl.fn!).filter(fl => fl);
		const renderedData = data.filter(row => !filterFns.some(filter => !filter(row)))
			.map(row => enabledIdxs.map(ci => row[ci]))
			.sort((ra, rb) => (ra[sortIdx] - rb[sortIdx]) * sort.direction);
		return { data: renderedData, columns: cols.map(id => columns[id]) };
	}, [data, columns, filters, settings.enabledColumns, sort]);

	const settingsContext = useMemo(() => {
		const set: SettingsSetter = (key, fn) => setSettings(sets => ({ ...sets, [key]: fn(sets[key]) }));
		return { settings, set };
	}, [settings, setSettings]);

	const plotDate = plotIdx && data[plotIdx][Object.keys(columns).indexOf('time')];
	const plotsMode = plotDate && (settings.plotTop || settings.plotLeft || settings.plotBottom);
	const longTable = !plotsMode || !settings.plotLeft;
	return (
		<SettingsContext.Provider value={settingsContext}>
			<DataContext.Provider value={dataContext}>
				<div className='TableApp' style={{ ...(!plotsMode && { display: 'block' }) }}>
					<div>
						<Menu {...{ filters, setFilters }}/>
						<TableView {...{ viewSize: longTable ? 16 : 10, sort, setSort, cursor, setCursor, plotId: plotIdx && data[plotIdx][0] }}/>
					</div>
					<PlotWrapper which='plotTop' date={plotDate}/>
					<PlotWrapper which='plotLeft' date={plotDate}/>
					<PlotWrapper which='plotBottom' date={plotDate}/>
				</div>
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