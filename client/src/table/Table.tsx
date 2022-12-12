import { useState, createContext, useContext, useMemo } from 'react';
import { useQuery } from 'react-query';
import '../css/Table.css';
import { Filter, Menu } from './TableMenu';
import TableView from './TableCore';
import { useEventListener } from '../util';

export const prettyName = (str: string) => str.split('_').map((s: string) => s.charAt(0).toUpperCase()+s.slice(1)).join(' ');

export type ColumnDef = {
	name: string,
	type: 'real' | 'integer' | 'text' | 'enum' | 'time',
	description?: string,
	enum?: string[],
	table: string,
	width: number,
	id: string
};
export type Columns = { [id: string]: ColumnDef };
export type Sort = { column: string, direction: 1 | -1 };
export type Cursor = { row: number, column: number, editing?: boolean } | null;

export const TableContext = createContext<{ data: any[][], columns: Columns, fisrtTable?: string }>({} as any);
export const DataContext = createContext<{ data: any[][], columns: ColumnDef[] }>({} as any);

const SHOW = ['time', 'onset_type', 'magnitude', 'v_max', 'h_max', 'bz_min', 'ap_max', 'dst_max', 'axy_max', 'solar_sources_type', 'solar_sources_description'];
const defaultColumns = (columns: Columns) => Object.values(columns).filter(col => SHOW.includes(col.id)).map(col => col.id);;

function CoreWrapper() {
	const { data, columns } = useContext(TableContext);
	const [filters, setFilters] = useState<Filter[]>([]);
	const [enabledColumns, setEnabledColumns] = useState(() => defaultColumns(columns));
	const [sort, setSort] = useState<Sort>({ column: 'time', direction: 1 });
	const [cursor, setCursor] = useState<Cursor>(null);
	// const [changes, setChanges] = useState(new Map<number, number[]>());

	useEventListener('escape', () => setCursor(curs => curs?.editing ? { ...curs, editing: false } : null));
	useEventListener('action+addFilter', () =>
		setFilters(fltrs => [...fltrs, { column: 'magnitude', operation: '>=', input: '', id: Date.now() }]));

	const dataContext = useMemo(() => {
		setCursor(null);
		console.time('render data');
		const enabledIdxs = enabledColumns.map(c => Object.keys(columns).indexOf(c));
		const sortIdx = enabledColumns.indexOf(sort.column);
		const filterFns = filters.map(fl => fl.fn!).filter(fl => fl);
		const renderedData = data.filter(row => !filterFns.some(filter => !filter(row)))
			.map(row => enabledIdxs.map(ci => row[ci]))
			.sort((ra, rb) => (ra[sortIdx] - rb[sortIdx]) * sort.direction);
		console.timeEnd('render data');
		return { data: renderedData, columns: enabledColumns.map(id => columns[id]) };
	}, [data, columns, filters, enabledColumns, sort]);

	return (
		<DataContext.Provider value={dataContext}>
			<Menu {...{ filters, setFilters, enabledColumns, setEnabledColumns }}/>
			<TableView {...{ sort, setSort, cursor, setCursor }}/>
		</DataContext.Provider>
	);
}

function SourceDataWrapper({ columns }: { columns: Columns }) {
	const query = useQuery({
		cacheTime: 60 * 60 * 1000,
		staleTime: Infinity,
		queryKey: ['tableData'], 
		queryFn: async () => {
			const res = await fetch(`${process.env.REACT_APP_API}api/forbush/`, { credentials: 'include' });
			if (res.status !== 200)
				throw new Error('HTTP '+res.status);
			const resp: {data: any[][], fields: string[]} = await res.json();
			if (!resp?.data.length)
				return null;
			const fisrtTable = Object.values(columns)[0].table as string;
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
			return { data: resp.data, columns: orderedColumns, fisrtTable } as const;
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
			const res = await fetch(`${process.env.REACT_APP_API}api/forbush/info/`, { credentials: 'include' });
			if (res.status !== 200)
				throw new Error('HTTP '+res.status);
			const tables: { [name: string]: { [name: string]: ColumnDef } } = await res.json();
			const columns = Object.fromEntries(Object.entries(tables).map(([table, cols]) => Object.entries(cols).map(([name, desc]) => {
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
			return columns as Columns;
		}
	});
	if (query.isLoading)
		return <div>Loading tables..</div>;
	if (!query.data)
		return <div>Failed to load tables</div>;
	return <SourceDataWrapper columns={query.data}/>;
}