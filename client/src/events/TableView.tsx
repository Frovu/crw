import { useState, useRef, useContext, useLayoutEffect, ChangeEvent, useEffect } from 'react';
import { clamp, useEventListener, Size } from '../util';
import { TableViewContext, valueToString, parseColumnValue, isValidColumnValue, ColumnDef,
	MainTableContext, useViewState, useEventsSettings, Cursor, prettyTable } from './events';
import { pickEventForSampe } from './sample';
import { openContextMenu } from '../app';

function CellInput({ id, column, value }: { id: number, column: ColumnDef, value: string }) {
	const [invalid, setInvalid] = useState(false);
	const { makeChange } = useContext(MainTableContext);
	const { escapeCursor } = useViewState(); 

	const onChange = (e: ChangeEvent<HTMLInputElement|HTMLSelectElement>) => {
		const str = e.target.value.trim();
		const val = str === '' ? null : str === 'auto' ? str : parseColumnValue(str, column);
		const isValid = ['auto', null].includes(val as any) || isValidColumnValue(val, column);
		const isOk = isValid && makeChange({ id, column, value: val });
		setInvalid(!isOk);
	};

	const inpStype = { width: '100%', borderWidth: 0, padding: 0,
		boxShadow: ' 0 0 16px 4px ' + (invalid ? 'var(--color-red)' : 'var(--color-active)' ) };

	return <>
		{column.type === 'enum' && <select autoFocus style={inpStype!}
			value={value} onChange={onChange} onBlur={escapeCursor}>
			<option value=''></option>
			{column.enum?.map(val => <option key={val} value={val}>{val}</option>)}
		</select>}
		{column.type !== 'enum' &&  <input type='text' autoFocus style={inpStype!}
			defaultValue={value} onChange={onChange} onBlur={escapeCursor}/>}
	</>;
}

export default function TableView({ nodeId, size }: { nodeId: string, size: Size }) {
	const { changes, changelog: wholeChangelog } = useContext(MainTableContext);
	const { data, columns, averages, markers } = useContext(TableViewContext);
	const { plotId, sort, cursor, toggleSort, setCursor, setEditing, escapeCursor } = useViewState();
	const { showChangelog } = useEventsSettings();

	const ref = useRef<HTMLDivElement | null>(null);
	const rowsHeight = size.height - (averages ? 213 : 106) - (showChangelog ? 54 : 0);
	const viewSize = Math.floor(rowsHeight / 26);
	const hRem = rowsHeight % 26;
	const trPadding = hRem > viewSize ? 1 : 0;
	const headerPadding = (hRem - viewSize * trPadding);
	const padTableH = Math.floor(headerPadding / 3);
	const padColumnH = headerPadding - padTableH;
	
	const [viewIndex, setViewIndex] = useState(Math.max(0, data.length - viewSize));

	const cursCol = cursor && columns[cursor?.column].id;
	const changelogEntry = (showChangelog || null) && cursor && wholeChangelog && data[cursor.row] && wholeChangelog[data[cursor.row][0]];
	const changelog = changelogEntry && Object.entries(changelogEntry)
		.filter(([col]) => columns.find(c => c.id === col))
		.flatMap(([col, chgs]) => chgs.map(c => ({ column: col, ...c })))
		.sort((a, b) => b.time - a.time)
		.sort((a, b) => (cursCol === b.column ? 1 : 0) - (cursCol === a.column ? 1 : 0));

	useEventListener('escape', escapeCursor);

	useLayoutEffect(() => {
		setCursor(null);
		setViewIndex(clamp(0, data.length - viewSize, data.length));
	}, [data.length, viewSize, sort, setCursor]);

	useEffect(() => {
		const cell = cursor && ref.current!.children[0]?.children[1].children[0]?.children[cursor.column] as HTMLElement;
		if (!cursor || !cell) return;
		const left = Math.max(0, cell.offsetLeft - ref.current?.offsetWidth! / 2);
		ref.current?.scrollTo({ left });
	}, [cursor, ref.current?.offsetWidth]);

	useEventListener('keydown', (e: KeyboardEvent) => {
		const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
		if (cursor && ['Enter', 'NumpadEnter', 'Insert'].includes(e.code)) {
			if (isInput) e.target.blur();
			return setEditing(!cursor?.editing); }
		if (isInput) return;
		if (cursor?.editing) return;

		if (cursor && ['-', '+', '='].includes(e.key))
			return pickEventForSampe('-' === e.key ? 'blacklist' : 'whitelist', data[cursor.row][0]);

		const set = (curs: Cursor) => {
			const newIdx = curs.row - 1 <= viewIndex ? curs.row - 1 : 
				(curs.row + 1 >= viewIndex+viewSize ? curs.row - viewSize + 2 : viewIndex);
			setViewIndex(Math.min(Math.max(newIdx, 0), data.length <= viewSize ? 0 : data.length - viewSize));
			setCursor(curs);
			e.preventDefault(); };
		
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
		const { row, column } = cursor ?? {
			row: deltaRow > 0 ? -1 : data.length,
			column: deltaCol >= 0 ? -1 : columns.length };

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
	
	const simulateKey = (key: string, ctrl: boolean=false) =>
		() => document.dispatchEvent(new KeyboardEvent('keydown', { code: key, ctrlKey: ctrl }));

	const tables = new Map<any, ColumnDef[]>();
	columns.forEach(col => tables.has(col.table) ? tables.get(col.table)?.push(col) : tables.set(col.table, [col]));

	return ( 
		<div style={{ border: '1px var(--color-border) solid', maxHeight: size.height, maxWidth: size.width }}>
			<div className='Table' style={{ position: 'relative' }} ref={ref}>
				<table onWheel={e => {
					setViewIndex(idx => {
						queueMicrotask(() => setCursor(null));
						const newIdx = idx + (e.deltaY > 0 ? 1 : -1) * Math.ceil(viewSize / 2);
						return clamp(0, data.length <= viewSize ? 0 : data.length - viewSize, newIdx);
					});}}>
					<thead><tr>
						{markers && <td rowSpan={2} title='f is for filter, + is whitelist, - is blacklist'
							className='ColumnHeader' style={{ minWidth: '3.5ch' }} onClick={() => toggleSort('_sample')}>
						##{sort.column === '_sample' && <div className='SortShadow' style={{ [sort.direction < 0 ? 'top' : 'bottom']: -2 }}/>}</td>}
						{[...tables].map(([table, cls]) =>
							<td className='ColumnHeader' key={table} style={{ clipPath: 'none' }} colSpan={cls.length}><div style={{ height: 26 + padTableH }}>
								<>{prettyTable(table)}</></div></td>)}
					</tr><tr>
						{columns.map((col) => <td key={col.id} title={`[${col.name}] ${col.description}`}
							className='ColumnHeader' onClick={() => toggleSort(col.id)}
							onContextMenu={openContextMenu('events', { nodeId, header: col })}>
							<div style={{ height: 46 + padColumnH }}><span>{col.name}</span>
								{sort.column === col.id && <div className='SortShadow' style={{ [sort.direction < 0 ? 'top' : 'bottom']: -2 }}/>}</div>
						</td>)}
					</tr></thead>
					<tbody>{data.slice(viewIndex, Math.max(0, viewIndex + viewSize)).map((row, ri) => {
						const idx = viewIndex + ri;
						const marker = markers?.[idx];
						const rowChanges = wholeChangelog?.[row[0]];
						const isCompModified = rowChanges && columns.map(c => c.isComputed && rowChanges[c.id]?.length && rowChanges[c.id][rowChanges[c.id].length - 1].new !== 'auto');
						return <tr style={{ height: 24 + trPadding, ...(plotId === row[0] && { backgroundColor: 'var(--color-area)' }) }}
							key={row[0] as any}>
							{marker && <td title='f: filtered; + whitelisted; - blacklisted'
								onClick={(e) => pickEventForSampe(e.ctrlKey ? 'blacklist' : 'whitelist', row[0])}>
								<span className='Cell' style={{ color: marker.endsWith('+') ? 'var(--color-cyan)' :
									marker.endsWith('-') ? 'var(--color-magenta)' : 'unset' }}>{marker}</span>
							</td>}
							{columns.map((column, cidx) => {
								const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
								return <td key={column.id} title={cidx === 0 && column.name === 'time' ? `id=${row[0]}` : ''}
									onClick={() => setCursor({ row: idx, column: cidx, editing: !!curs })}
									style={{ borderColor: curs ? 'var(--color-active)' : 'var(--color-border)' }}>
									<div style={{ position: 'absolute', height: 24 + 2 + trPadding, width: `calc(${column.width}ch + 4px)` }}
										onContextMenu={openContextMenu('events', { nodeId, cell: { id: row[0], value: row[cidx+1], column } })}/>
									{curs?.editing ? <CellInput {...{ id: row[0], column, value: valueToString(row[cidx+1]) }}/> :
										<span className='Cell' style={{ width: column.width + 'ch' }}>
											{valueToString(row[cidx+1])}
											{isCompModified?.[cidx] && <span className='ModifiedMarker'/>}</span>}
								</td>;
							})}
						</tr>;})}</tbody>
					{averages && (<tfoot>
						<tr style={{ height: 0 }}><td colSpan={columns.length} style={{ height: 1, borderTop: 'none' }}></td></tr>
						{['median', 'mean', 'σ', 'σ / √n'].map((label, ari) => <tr key={label} style={{ height: 24 }}>
							{averages.map((avgs, i) => {
								const isLabel = columns[i].type === 'time';
								return <td key={columns[i].id} style={{ borderColor: 'var(--color-grid)',
									textAlign: isLabel ? 'right' : 'unset', padding: isLabel ? '0 6px' : 0 }}>
									{isLabel ? label : avgs ? avgs[ari].toFixed?.(ari > 2 ? 3 : avgs[1] > 99 ? 1 : 2) : ''}</td>;
							})}
						</tr>)}
					</tfoot>)}
				</table>
			</div>
			{showChangelog && <div style={{ position: 'relative', display: 'flex', flexDirection: 'column-reverse', fontSize: 14, border: '1px var(--color-border) solid',
				height: 52, padding: 2, margin: 2, marginTop: 0, overflowY: 'scroll' }}>
				{changelog?.length ? changelog.map(change => {
					const column = columns.find(c => c.id === change.column)!;
					const time = new Date(change.time * 1e3);
					const val = (str: string | null) =>
						str == null ? 'null' : column.type === 'time' ? new Date(parseInt(str)*1e3).toISOString().replace(/\..*|T/g, ' ') : str;
					return (<div key={JSON.stringify(change)} style={{ margin: '0' }}>
						<i style={{ color: 'var(--color-text-dark)' }}>[{time.toISOString().replace(/\..*|T/g, ' ').slice(0,-4)}] @{change.author} </i>
						<i style={{ color: columns[cursor!.column].id === column.id ? 'var(--color-active)' : 'unset' }}> <b>{column.fullName}</b></i>
						: {val(change.old)} -&gt; <b>{val(change.new)}</b>
					</div>);}) : <div className='Center' style={{ color: 'var(--color-text-dark)' }}>NO CHANGES</div>}
			</div>}
			<div style={{ padding: '0 2px 2px 4px', display: 'flex', justifyContent: 'space-between' }}>
				<span style={{ color: 'var(--color-text-dark)', fontSize: '14px' }}>
					<span style={{ color: 'var(--color-active)' }}> [{data.length}]</span>
					&nbsp;{viewIndex+1} to {Math.min(viewIndex+viewSize+1, data.length)}
					{changes.length > 0 && <span style={{ color: 'var(--color-red)', fontSize: '14px' }}>
					&nbsp;&nbsp;With [{changes.length}] unsaved&nbsp;
					</span>}
				</span>
				<span style={{ display: 'inline-flex', gap: '2px', fontSize: '16px' }}>
					<button className='TableControl' onClick={simulateKey('ArrowUp')}><span>↑</span></button>
					<button className='TableControl' onClick={simulateKey('ArrowDown')}><span>↓</span></button>
					<button className='TableControl' onClick={simulateKey('Home', true)}><span>H</span></button>
					<button className='TableControl' onClick={simulateKey('End', true)}><span>E</span></button>
					<button className='TableControl' onClick={simulateKey('ArrowLeft')}><span>←</span></button>
					<button className='TableControl' onClick={simulateKey('ArrowRight')}><span>→</span></button>
				</span>
			</div>
		</div>
	);
}