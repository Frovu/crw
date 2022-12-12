import { useState, useRef, useEffect, useContext, useLayoutEffect } from 'react';
import { useEventListener } from '../util';
import { ColumnDef, Sort, Cursor, prettyName, DataContext } from './Table';

function Cell({ value, cursor, def }: { value: any, cursor: Cursor, def: ColumnDef }) {
	const val = value instanceof Date ? value.toISOString().replace(/\..+/, '').replace('T', ' ') : value;
	const width = { width: def.width+.5+'ch' };
	return (
		<td style={{ ...(cursor && { borderColor: 'var(--color-active)' }) }}>
			{!cursor?.editing &&
			<span className='Cell' style={{ ...width }}>{val}</span>}
			{cursor?.editing &&
			<input style={{ ...width, border: 'none', padding: 0, boxShadow: ' 0 0 16px 4px var(--color-active)' }} autoFocus type='text' value={val}></input>}
		</td>
	);
}

function Row({ row, columns, cursor }: { row: any[], columns: ColumnDef[], cursor?: Cursor }) {

	// eslint-disable-next-line react/no-array-index-key
	return <tr>{row.map((value, i) =><Cell key={i} {...{ value, cursor: cursor?.column === i ? cursor : null, def: columns[i] }}/>)}</tr>;
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
		if (cursor?.editing) return;
		if (cursor && e.key === 'Enter')
			return setCursor({ ...cursor, editing: true });

		const set = (curs: Exclude<Cursor, null>) => {
			const newIdx = curs.row - 1 <= viewIndex ? curs.row - 1 : 
				(curs.row + 1 >= viewIndex+viewSize ? curs.row - viewSize + 2 : viewIndex);
			setViewIndex(Math.min(Math.max(newIdx, 0), data.length <= viewSize ? 0 : data.length - viewSize));
			setCursor(curs);
		};
		if (e.ctrlKey && e.key === 'Home')
			return set({ row: 0, column: cursor?.column ?? 0 });
		if (e.ctrlKey && e.key === 'End')
			return set({ row: data.length - 1, column: cursor?.column ?? 0 });

		const delta = {
			'ArrowUp': [-1, 0],
			'ArrowDown': [1, 0],
			'ArrowLeft': [0, -1],
			'ArrowRight': [0, 1],
			'PageUp': [-viewSize, 0],
			'PageDown': [viewSize, 0],
			'Home': [0, -columns.length],
			'End': [0, columns.length]
		}[e.key];
		if (!delta) return;
		const { row, column } = cursor ?? { row: Math.min(Math.round(viewIndex+viewSize/2), data.length), column: Math.round(columns.length/2) };
		const [deltaRow, deltaCol] = delta;
		set({
			row: Math.min(Math.max(0, row + deltaRow), data.length - 1),
			column: Math.min(Math.max(0, column + deltaCol), columns.length - 1)
		});		
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