import { useState, useRef, useEffect, useContext, useLayoutEffect } from 'react';
import { useEventListener } from '../util';
import { ColumnDef, Sort, Cursor, prettyName, DataContext } from './Table';

type CursorPara = { cursor: Cursor, setCursor: (c: Cursor) => void };

function Cell({ value, cursor, def, onClick }: { value: any, cursor: Cursor, def: ColumnDef, onClick: () => void }) {
	const val = value instanceof Date ? value.toISOString().replace(/\..+/, '').replace('T', ' ') : value;
	const width = { width: def.width+.5+'ch' };
	return (
		<td onClick={onClick} style={{ ...(cursor && { borderColor: 'var(--color-active)' }) }}>
			{!cursor?.editing &&
			<span className='Cell' style={{ ...width }}>{val}</span>}
			{cursor?.editing &&
			<input style={{ ...width, border: 'none', padding: 0, boxShadow: ' 0 0 16px 4px var(--color-active)' }} autoFocus type='text' value={val} onChange={()=>{}}></input>}
		</td>
	);
}

function Row({ index, row, columns, cursor, setCursor, highlight }: { index: number, row: any[], columns: ColumnDef[], highlight: boolean } & CursorPara) {
	const isSel = index === cursor?.row;
	return (<tr {...(highlight && { style: { color: 'var(--color-cyan)' } })}>{row.map((value, i) =>
		<Cell key={i} onClick={() => setCursor({ row: index, column: i, editing: isSel && i === cursor?.column })} // eslint-disable-line react/no-array-index-key
			{...{ value, cursor: isSel && i === cursor?.column ? cursor : null, def: columns[i] }}/>) 
	}</tr>);
}

function ColumnHeader({ col, sort, setSort }: { col: ColumnDef, sort: Sort, setSort: (s: Sort) => void}) {
	return (
		<td title={col.description} style={{ maxWidth: col.width+.5+'ch', position: 'relative', clipPath: 'polygon(0 0,0 100%,100% 100%, 100% 0)', wordBreak: 'break-word', cursor: 'pointer', userSelect: 'none' }}
			onClick={()=>setSort({ column: col.id, direction: sort.column === col.id ? sort.direction * -1 as any : 1 })}>
			{col.name}
			{sort.column === col.id &&
				<div style={{ backgroundColor: 'transparent', position: 'absolute', left: 0, width: '100%', height: 1,
					[sort.direction < 0 ? 'top' : 'bottom']: -2, boxShadow: '0 0px 20px 6px var(--color-active)' }}/> }
		</td>
	);
}

export default function TableView({ viewSize, sort, setSort, cursor, setCursor, plotId }:
{ viewSize: number, sort: Sort, setSort: (s: Sort) => void, plotId: null | number } & CursorPara ) {
	const { data, columns } = useContext(DataContext);
	const ref = useRef<HTMLDivElement>(null);
	const [viewIndex, setViewIndex] = useState(0);

	useLayoutEffect(() => {
		setViewIndex(Math.max(0, data.length - viewSize));
	}, [data.length, viewSize]);
	useEffect(() => {
		if (!ref.current) return;
		ref.current.onwheel = e => setViewIndex(idx =>
			Math.min(Math.max(idx + (e.deltaY > 0 ? 1 : -1) * Math.ceil(viewSize / 2), 0), data.length <= viewSize ? 0 : data.length - viewSize));
	}, [data.length, viewSize]);

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (cursor && ['Enter', 'Insert'].includes(e.code))
			return setCursor({ ...cursor, editing: !cursor.editing });
		if (e.target instanceof HTMLInputElement) return;
		if (cursor?.editing) return;

		const set = (curs: Exclude<Cursor, null>) => {
			const newIdx = curs.row - 1 <= viewIndex ? curs.row - 1 : 
				(curs.row + 1 >= viewIndex+viewSize ? curs.row - viewSize + 2 : viewIndex);
			setViewIndex(Math.min(Math.max(newIdx, 0), data.length <= viewSize ? 0 : data.length - viewSize));
			setCursor(curs);
			e.preventDefault();
			const cell = ref.current!.children[0]?.children[1].children[0].children[curs.column] as HTMLElement;
			const left = Math.max(0, cell.offsetLeft - ref.current?.offsetWidth! / 2);
			ref.current?.scrollTo({ left });
		};
		if (e.ctrlKey && e.code === 'Home')
			return set({ row: 0, column: cursor?.column ?? 0 });
		if (e.ctrlKey && e.code === 'End')
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
		}[e.code];
		if (!delta) return;
		const [deltaRow, deltaCol] = delta;
		const { row, column } = cursor ?? { row: Math.min(Math.round(viewIndex+viewSize/2), data.length), column: Math.round(columns.length/2) };

		if (e.ctrlKey && deltaRow !== 0) {
			let cur = row + deltaRow;
			while (data[cur][column] === null && cur > 0 && cur < data.length - 1)
				cur += deltaRow;
			return set({ row: cur, column });
		}
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
						<Row key={row[0]} {...{ index: i + viewIndex, row: row.slice(1), columns, cursor, setCursor, highlight: row[0] === plotId }}/>)}
				</tbody>
			</table>
			<div style={{ textAlign: 'left', color: 'var(--color-text-dark)', fontSize: '14px', padding: '0 0 2px 6px' }}>
				{viewIndex+1} to {Math.min(viewIndex+viewSize+1, data.length)} of {data.length}
			</div>
		</div>
	);
}