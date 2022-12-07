import { useState, useRef, useEffect } from 'react';
import { useQuery } from 'react-query';
import '../css/Table.css';

type ColumnDef = {
	name: string,
	type: 'real' | 'integer' | 'text' | 'enum' | 'time',
	description?: string,
	enum?: string[],
	table?: string
};

function Cell({ value, def }: { value: number | string | null, def: ColumnDef }) {
	return <td>{value}</td>;

}

function Table({ data, columns }: { data: any[][], columns: ColumnDef[] }) {
	const viewSize = 10;
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!ref.current) return;
		ref.current.addEventListener('scroll', console.log)

	}, [ref.current]);
	const [viewIndex, setViewIndex] = useState(0);
	return (
		<div ref={ref}>
			<table>
				<thead>
					<tr>
						{columns.map(col => <td>{col.name}</td>)}
					</tr>
				</thead>
				<tbody>
					{data.slice(viewIndex, viewIndex+viewSize).map(row => <tr>{row.map((value, i) => <Cell {...{ value, def: columns[i] }}/>)}</tr>)}
				</tbody>
			</table>
		</div>
	);
}

function DataWrapper({ columns }: { columns: {[col: string]: ColumnDef} }) {
	const query = useQuery(['tableData'], async () => {
		const res = await fetch(`${process.env.REACT_APP_API}api/forbush/`, { credentials: 'include' });
		if (res.status !== 200)
			throw new Error('HTTP '+res.status);
		const resp: {data: any[][], fields: string[]} = await res.json();
		if (!resp?.data.length)
			return null;
		return { data: resp.data, columns: resp.fields.map(f => columns[f]) };
	});
	if (query.isLoading)
		return <div>Loading data..</div>;
	if (!query.data)
		return <div>Failed to load data</div>;
	return <Table {...query.data}/>;
}

export default function TableWrapper() {
	const query = useQuery(['tableStructure'], async () => {
		const res = await fetch(`${process.env.REACT_APP_API}api/forbush/info/`, { credentials: 'include' });
		if (res.status !== 200)
			throw new Error('HTTP '+res.status);
		const tables: { [name: string]: { [name: string]: ColumnDef } } = await res.json();
		const columns = Object.fromEntries(Object.entries(tables)
			.map(([table, cols]) => Object.entries(cols).map(([col, desc]) => [col, { ...desc, table, col }])).flat());
		return columns as {[col: string]: ColumnDef};
	});
	if (query.isLoading)
		return <div>Loading tables..</div>;
	if (!query.data)
		return <div>Failed to load tables</div>;
	return <DataWrapper columns={query.data}/>;
}