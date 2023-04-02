import { useState, useRef, useEffect, useContext, useLayoutEffect } from 'react';
import { dispatchCustomEvent, useEventListener } from '../util';
import { ColumnDef, Sort, Cursor, DataContext, prettyTable } from './Table';

type CursorPara = { cursor: Cursor, setCursor: (c: Cursor) => void };

function Cell({ value, cursor, def, onClick }: { value: any, cursor: Cursor, def: ColumnDef, onClick: () => void }) {
	const val = value instanceof Date ? value.toISOString().replace(/\..+/, '').replace('T', ' ') : value;
	const width = { width: def.width+.5+'ch' };
	return (
		<td onClick={onClick} style={{ ...(cursor && { borderColor: 'var(--color-active)' }) }}>
			{!cursor?.editing &&
			<span className='Cell' style={{ ...width }}>{val}</span>}
			{cursor?.editing &&
			<input style={{ ...width, border: 'none', padding: 0, boxShadow: ' 0 0 16px 4px var(--color-active)' }} autoFocus type='text' value={val || ''} onChange={()=>{}}></input>}
		</td>
	);
}

function Row({ index, row, columns, cursor, setCursor, highlight, marker }:
{ index: number, row: any[], columns: ColumnDef[], highlight: boolean, marker: null | string } & CursorPara) {
	const isSel = index === cursor?.row;
	const mLast = marker && marker[marker.length-1];
	return (
		<tr {...(highlight && { style: { color: 'var(--color-cyan)' } })}>
			{marker && <td onClick={(e) => dispatchCustomEvent('sampleEdit', { action: e.ctrlKey ? 'blacklist' : 'whitelist', id: row[0] }  )}>
				<span className='Cell' style={{ color: mLast === '+' ? 'var(--color-cyan)' : mLast === '-' ? 'var(--color-magenta)' : 'unset' }}>{marker}</span>
			</td>}
			{row.slice(1).map((value, i) =>
				<Cell key={i} onClick={() => setCursor({ row: index, column: i, editing: isSel && i === cursor?.column })} // eslint-disable-line react/no-array-index-key
					{...{ value, cursor: isSel && i === cursor?.column ? cursor : null, def: columns[i] }}/>)}
		</tr>
	);
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
	const { data, columns, markers } = useContext(DataContext);
	const ref = useRef<HTMLDivElement>(null);
	const [viewIndex, setViewIndex] = useState(0);

	const updateViewIndex = (curs: Exclude<Cursor, null>) => {
		const newIdx = curs.row - 1 <= viewIndex ? curs.row - 1 : 
			(curs.row + 1 >= viewIndex+viewSize ? curs.row - viewSize + 2 : viewIndex);
		setViewIndex(Math.min(Math.max(newIdx, 0), data.length <= viewSize ? 0 : data.length - viewSize));
	};

	useLayoutEffect(() => {
		setViewIndex(Math.max(0, data.length - viewSize));
	}, [data.length, viewSize, sort]);
	useEffect(() => {
		if (!ref.current) return;
		ref.current.onwheel = e => setViewIndex(idx => {
			const newIdx = Math.min(Math.max(idx + (e.deltaY > 0 ? 1 : -1) * Math.ceil(viewSize / 2), 0), data.length <= viewSize ? 0 : data.length - viewSize);
			setCursor(((curs: Cursor) => ((curs?.row! > newIdx + viewSize || curs?.row! < newIdx) ? null : curs)) as any);
			return newIdx;
		});
	}, [data.length, viewSize, setCursor]);
	useLayoutEffect(() => {
		if (!cursor) return;
		updateViewIndex(cursor);
		const cell = ref.current!.children[0]?.children[1].children[0]?.children[cursor.column] as HTMLElement;
		const left = Math.max(0, cell.offsetLeft - ref.current?.offsetWidth! / 2);
		ref.current?.parentElement?.scrollTo({ left });
	}, [cursor]); // eslint-disable-line
	useLayoutEffect(() => {
		const navRow = ref.current?.parentElement?.children[1] as HTMLElement;
		const nav = navRow.children[0] as HTMLElement;
		const width = ref.current?.offsetWidth! - 6;
		nav.style.width = width + 'px';
		navRow.style.height = width > 320 ? '22px' : width > 200 ? '40px' : '60px';
	});

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (cursor && ['Enter', 'NumpadEnter', 'Insert'].includes(e.code))
			return setCursor({ ...cursor, editing: !cursor.editing });
		if (e.target instanceof HTMLInputElement) return;
		if (cursor?.editing) return;

		if (cursor && ['-', '+', '='].includes(e.key))
			return dispatchCustomEvent('sampleEdit', { id: data[cursor.row][0], action: '-' === e.key ? 'blacklist' : 'whitelist' });
		if (cursor && ['1', '2', '3', '4'].includes(e.key))
			return dispatchCustomEvent('setColumn', { which: parseInt(e.key), column: columns[cursor?.column] });

		const set = (curs: Exclude<Cursor, null>) => {
			updateViewIndex(curs);
			setCursor(curs);
			e.preventDefault();
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

	const simulateKey = (key: string, ctrl: boolean=false) => () => document.dispatchEvent(new KeyboardEvent('keydown', { code: key, ctrlKey: ctrl }));
	const tables = new Map<any, ColumnDef[]>();
	columns.forEach(col => tables.has(col.table) ? tables.get(col.table)?.push(col) : tables.set(col.table, [col]));
	return (
		<div className='Table'>
			<div ref={ref}>
				<table style={{ tableLayout: 'fixed' }}>
					<thead>
						<tr>
							{markers && <td key='smpl' style={{ minWidth: '3ch', position: 'relative', clipPath: 'polygon(0 0,0 100%,100% 100%, 100% 0)', cursor: 'pointer' }} title='f is filter, + is whitelist, - is blacklist'
								onClick={()=>setSort({ column: '_sample', direction: sort.column !== '_sample' ? 1 : sort.direction*-1 as any })} rowSpan={2}>##{sort.column === '_sample' && <div style={{ backgroundColor: 'transparent', position: 'absolute', left: 0, width: '100%', height: 1,
									[sort.direction < 0 ? 'top' : 'bottom']: -2, boxShadow: '0 0px 20px 6px var(--color-active)' }}/>}</td>}
							{[...tables].map(([table, cols]) => <td key={table} colSpan={cols.length}>{prettyTable(table)}</td>)}
						</tr>
						<tr>
							{columns.map(col => <ColumnHeader key={col.id} {...{ col, sort, setSort }}/>)}
						</tr>
					</thead>
					<tbody>
						{data.slice(viewIndex, viewIndex+viewSize).map((row, i) =>
							<Row key={row[0]} {...{ marker: markers && markers[i + viewIndex],
								index: i + viewIndex, row, columns, cursor, setCursor, highlight: row[0] === plotId }}/>)}
					</tbody>
				</table>
			</div>
			<div style={{ height: '22px' }}>
				<div style={{ position: 'fixed', padding: '0 2px 0 4px', display: 'inline-flex', justifyContent: 'space-between' }}>
					<span style={{ color: 'var(--color-text-dark)', fontSize: '14px' }}>
						{viewIndex+1} to {Math.min(viewIndex+viewSize+1, data.length)} of {data.length}
					</span>
					<span style={{ display: 'inline-flex', gap: '2px', fontSize: '16px' }}>
						<button className='tableControl' onClick={simulateKey('ArrowUp')}><span>↑</span></button>
						<button className='tableControl' onClick={simulateKey('ArrowDown')}><span>↓</span></button>
						<button className='tableControl' onClick={simulateKey('Home', true)}><span>H</span></button>
						<button className='tableControl' onClick={simulateKey('End', true)}><span>E</span></button>
						<button className='tableControl' onClick={simulateKey('ArrowLeft')}><span>←</span></button>
						<button className='tableControl' onClick={simulateKey('ArrowRight')}><span>→</span></button>
					</span>
				</div>
			</div>
		</div>
	);
}