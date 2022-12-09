import { useState, useRef, useEffect, createContext, useContext, useMemo } from 'react';
import { useQuery } from 'react-query';
import '../css/Table.css';
import { FiltersView } from './TableControls';
import TableView from './TableCore';

export const TableContext = createContext<{ data: any[][], columns: ColumnDef[], fisrtTable: string }>({ data: [], columns: [], fisrtTable: '' });

export type ColumnDef = {
	name: string,
	type: 'real' | 'integer' | 'text' | 'enum' | 'time',
	description?: string,
	enum?: string[],
	table?: string
};
export type Filter = (r: any[]) => boolean;

function FilterDataWrapper() {
	const [filters, setFilters] = useState<Filter[]>([]);
	const [enabledColumns, setEnabledColumns] = useState([0, 1, 2, 3]);
	const [changes, setChanges] = useState(new Map<number, number[]>());

	const { data, columns } = useContext(TableContext);
	const renderedData = useMemo(() => {
		const rendered = data.filter((row) => {
			for (const filter of filters)
				if (!filter(row)) return false;
			return true;
		}).map(row => enabledColumns.map(ci => row[ci]));
		// TODO: sort
		return rendered;
	}, [data, filters, enabledColumns]);

	return (
		<div>
			<FiltersView {...{ setFilters }}/>
			<TableView data={renderedData} columns={enabledColumns.map(ci => columns[ci])}/>
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