import { useState, useRef, useEffect, useContext, useLayoutEffect } from 'react';
import { useEventListener } from '../util';
import { ColumnDef, Sort, Cursor, prettyName, DataContext } from './Table';

function Cell({ value, editing, def }: { value: any, editing: boolean, def: ColumnDef }) {
	const val = value instanceof Date ? value.toISOString().replace(/\..+/, '').replace('T', ' ') : value;
	if (!editing)
		return <span className='Cell' style={{ width: def.width+.5+'ch' }}>{val}</span>;
	return <input type='text' value={val}></input>;
}

function Row({ row, columns, cursor }: { row: any[], columns: ColumnDef[], cursor?: Cursor }) {

	// eslint-disable-next-line react/no-array-index-key
	return <tr>{row.map((value, i) =><td key={i}><Cell {...{ value, editing: cursor?.column === i, def: columns[i] }}/></td>)}</tr>;
}

function ColumnHeader({ col, sort, setSort }: { col: ColumnDef, sort: Sort, setSort: (s: Sort) => void}) {
	return (
		<td title={col.description} style={{ maxWidth: col.width+.5+'ch', position: 'relative', clipPath: 'border-box', wordBreak: 'break-word', cursor: 'pointer', userSelect: 'none' }}
			onClick={()=>setSort({ column: col.id, direction: sort.column === col.id ? sort.direction * -1 as any : 1 })}>
			{col.name}
			{sort.column === col.id &&
				<div style={{ backgroundColor: 'transparent', position: 'absolute', left: 0, width: '100%', height: 1,
					[sort.direction < 0 ? 'top' : 'bottom']: -2, boxShadow: '0 0px 20px 6px var(--color-active)' }}/> }
		</td>
	);
}

export default function TableView({ sort, setSort, cursor, setCursor }: { sort: Sort, setSort: (s: Sort) => void, cursor: Cursor, setCursor: (c: Cursor) => void }) {
	const { data, columns } = useContext(DataContext);
	const viewSize = 10;
	const ref = useRef<HTMLDivElement>(null);
	const [viewIndex, setViewIndex] = useState(0);

	useLayoutEffect(() => {
		setViewIndex(data.length - viewSize);
	}, [data]);
	useEffect(() => {
		if (!ref.current) return;
		ref.current.onwheel = e => setViewIndex(idx =>
			Math.min(Math.max(idx + (e.deltaY > 0 ? 1 : -1) * Math.ceil(viewSize / 2), 0), data.length <= viewSize ? 0 : data.length - viewSize));
	}, [data.length, ref]);

	useEventListener('keydown', (e: KeyboardEvent) => {
		console.log(e.key)
	});

	const tables = new Map<any, ColumnDef[]>();
	columns.forEach(col => tables.has(col.table) ? tables.get(col.table)?.push(col) : tables.set(col.table, [col]));

	return (
		<div className='Table' ref={ref}>
			<table style={{ tableLayout: 'fixed' }}>
				<thead>
					<tr>
						{[...tables].map(([table, cols]) => <td key={table} colSpan={cols.length}>{prettyName(table)}</td>)}
					</tr>
					<tr>
						{columns.map(col => <ColumnHeader key={col.id} {...{ col, sort, setSort }}/>)}
					</tr>
				</thead>
				<tbody>
					{data.slice(viewIndex, viewIndex+viewSize).map((row, i) =>
						<Row key={row[0].getTime()} {...{ row, columns, cursor: cursor?.row === viewIndex+i ? cursor : null }}/>)}
				</tbody>
			</table>
			<div style={{ textAlign: 'left', color: 'var(--color-text-dark)', fontSize: '14px' }}>
				{viewIndex+1} to {Math.min(viewIndex+viewSize+1, data.length)} of {data.length}
			</div>
		</div>
	);
}