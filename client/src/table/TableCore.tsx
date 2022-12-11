import { useState, useRef, useEffect, useContext } from 'react';
import { ColumnDef, Sort, prettyName, DataContext } from './Table';

function Cell({ value, def }: { value: Date | number | string | null, def: ColumnDef }) {
	const val = value instanceof Date ? value.toISOString().replace(/\..+/, '').replace('T', ' ') : value;
	return <span className='Cell' style={{ width: def.width+.5+'ch' }}>{val}</span>;
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

export default function TableView({ sort, setSort }: { sort: Sort, setSort: (s: Sort) => void }) {
	const { data, columns } = useContext(DataContext);
	const viewSize = 10;
	const ref = useRef<HTMLDivElement>(null);
	const [viewIndex, setViewIndex] = useState(0);
	useEffect(() => {
		setViewIndex(data.length - viewSize);
	}, [data]);
	useEffect(() => {
		if (!ref.current) return;
		ref.current.onwheel = e => setViewIndex(idx =>
			Math.min(Math.max(idx + (e.deltaY > 0 ? 1 : -1) * Math.ceil(viewSize / 2), 0), data.length <= viewSize ? 0 : data.length - viewSize));
	}, [data.length, ref]);
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
					{data.slice(viewIndex, viewIndex+viewSize).map((row, idx) =>
						<tr key={viewIndex+idx}>{row.map((value, i) =><td key={i}><Cell {...{ value, def: columns[i] }}/></td>)}</tr>) /* eslint-disable-line react/no-array-index-key */}
				</tbody>
			</table>
			<div style={{ textAlign: 'left', color: 'var(--color-text-dark)', fontSize: '14px' }}>
				{viewIndex+1} to {Math.min(viewIndex+viewSize+1, data.length)} of {data.length}
			</div>
		</div>
	);
}