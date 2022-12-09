import { useState, useRef, useEffect, createContext, useContext, useMemo } from 'react';
import { useQuery } from 'react-query';
import '../css/Table.css';
import { FiltersView } from './TableControls';

export const TableContext = createContext<{ data: any[][], columns: ColumnDef[], fisrtTable: string }>({ data: [], columns: [], fisrtTable: '' });

export type ColumnDef = {
	name: string,
	type: 'real' | 'integer' | 'text' | 'enum' | 'time',
	description?: string,
	enum?: string[],
	table?: string
};
export type Filter = (r: any[]) => boolean;

function Cell({ value, def }: { value: number | string | null, def: ColumnDef }) {
	return <span>{value}</span>;

}

function TableView() {
	const { data, columns } = useContext(TableContext);
	const viewSize = 10;
	const ref = useRef<HTMLDivElement>(null);
	const [viewIndex, setViewIndex] = useState(0);
	useEffect(() => {
		if (!ref.current) return;
		ref.current.onwheel = e => setViewIndex(idx => Math.min(Math.max(idx + (e.deltaY > 0 ? 1 : -1) * Math.ceil(viewSize / 2), 0), data.length - viewSize));
	}, [data.length, ref]);
	return (
		<div ref={ref}>
			<table>
				<thead>
					<tr>
						{columns.map(col => <td key={col.table+col.name}>{col.name}</td>)}
					</tr>
				</thead>
				<tbody>
					{data.slice(viewIndex, viewIndex+viewSize).map((row, idx) => <tr key={viewIndex+idx}>{row.map((value, i) => <td key={i}><Cell {...{ value, def: columns[i] }}/></td>)}</tr>) /* eslint-disable-line react/no-array-index-key */}
				</tbody>
			</table>
		</div>
	);
}

function FilterDataWrapper() {
	const [filters, setFilters] = useState<Filter[]>([]);
	const [enabledColumns, setEnabledColumns] = useState([0, 1, 2, 3]);
	const [changes, setChanges] = useState(new Map<number, number[]>());

	const { data, columns } = useContext(TableContext);
	const renderedData = useMemo(() => {
		console.log(filters)
		const rendered = [];
		for (const row of data) {

		}
	}, [filters, enabledColumns]);

	return (
		<div>
			<FiltersView {...{ setFilters }}/>
			<TableView/>
		</div>
	);
}

function SourceDataWrapper({ columns }: { columns: {[col: string]: ColumnDef} }) {
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
			return { data: resp.data, columns: resp.fields.map(f => columns[f]), fisrtTable } as const;
		}
	});
	if (query.isLoading)
		return <div>Loading data..</div>;
	if (!query.data)
		return <div>Failed to load data</div>;
	return (
		<TableContext.Provider value={query.data}>
			<FilterDataWrapper/>
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
			const columns = Object.fromEntries(Object.entries(tables)
				.map(([table, cols]) => Object.entries(cols).map(([col, desc]) => [col, { ...desc, table, col }])).flat());
			return columns as {[col: string]: ColumnDef};
		}
	});
	if (query.isLoading)
		return <div>Loading tables..</div>;
	if (!query.data)
		return <div>Failed to load tables</div>;
	return <SourceDataWrapper columns={query.data}/>;
}