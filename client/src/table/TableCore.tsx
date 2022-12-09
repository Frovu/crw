import { useState, useRef, useEffect, createContext, useContext, useMemo } from 'react';
import { ColumnDef } from './Table';

function Cell({ value, def }: { value: number | string | null, def: ColumnDef }) {
	return <span>{value}</span>;

}

export default function TableView({ data, columns }: { data: any[][], columns: ColumnDef[] }) {
	const viewSize = 10;
	const ref = useRef<HTMLDivElement>(null);
	const [viewIndex, setViewIndex] = useState(0);
	useEffect(() => {
		if (!ref.current) return;
		ref.current.onwheel = e => setViewIndex(idx => Math.min(Math.max(idx + (e.deltaY > 0 ? 1 : -1) * Math.ceil(viewSize / 2), 0), data.length - viewSize));
	}, [data.length, ref]);
	return (
		<div className='Table' ref={ref}>
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