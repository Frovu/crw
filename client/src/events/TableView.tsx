import { useState, useRef, useContext, useLayoutEffect, ChangeEvent } from 'react';
import { clamp, dispatchCustomEvent, useEventListener, Size } from '../util';
import { TableViewContext, valueToString, parseColumnValue, isValidColumnValue, ColumnDef,
	MainTableContext, useViewState, useEventsSettings, Cursor, prettyTable } from './events';
import { pickEventForSampe } from './sample';

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

const MAX_CHANGELOG_ROWS = 3;
export default function TableView({ size }: { size: Size }) {
	const { changes, changelog: wholeChangelog } = useContext(MainTableContext);
	const { data, columns, averages, markers } = useContext(TableViewContext);
	const { plotId, sort, cursor, toggleSort, setCursor, escapeCursor } = useViewState();
	const { showChangelog } = useEventsSettings();

	const viewSize = Math.floor(size.height / 28) - 8; // FIXME
	const ref = useRef<HTMLDivElement>(null);
	const [viewIndex, setViewIndex] = useState(Math.max(0, data.length - viewSize));

	const changelogEntry = (showChangelog || null) && cursor && wholeChangelog && data[cursor.row] && wholeChangelog[data[cursor.row][0]];
	const changelog = changelogEntry && Object.entries(changelogEntry)
		.filter(([col]) => columns.find(c => c.id === col))
		.flatMap(([col, chgs]) => chgs.map(c => ({ column: col, ...c })))
		.sort((a, b) => [a, b].map(chg => Math.abs(cursor.column - columns.findIndex(c => c.id === chg.column))).reduce((da,db)=>db-da) ); // ???
	const changesRows = Math.min(3, changelog?.length ?? 0);

	const updateViewIndex = (curs: Cursor) => {
		const indent = showChangelog ? MAX_CHANGELOG_ROWS + 1 : 1;
		const newIdx = curs.row - 1 <= viewIndex ? curs.row - 1 : 
			(curs.row + indent >= viewIndex+viewSize ? curs.row - viewSize + indent + 1 : viewIndex);
		setViewIndex(Math.min(Math.max(newIdx, 0), data.length <= viewSize ? 0 : data.length - viewSize + changesRows));
	};

	useEventListener('escape', escapeCursor);

	// TODO: less rerenders?

	useLayoutEffect(() => {
		setViewIndex(clamp(0, data.length - viewSize, cursor ? Math.ceil(cursor.row-viewSize/2) : data.length));
	}, [data.length, viewSize, sort, cursor]);

	useLayoutEffect(() => {
		if (!cursor) return;
		updateViewIndex(cursor);
		const cell = ref.current!.children[0]?.children[1].children[0]?.children[cursor.column] as HTMLElement;
		if (!cell) return;
		const left = Math.max(0, cell.offsetLeft - ref.current?.offsetWidth! / 2);
		ref.current?.scrollTo({ left });
		const log = ref.current?.parentElement?.querySelector('#changelog');
		log?.scrollTo(0, log.scrollHeight);
	}, [cursor, ref.current?.offsetWidth]); // eslint-disable-line

	useEventListener('keydown', (e: KeyboardEvent) => {
		const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
		if (cursor && ['Enter', 'NumpadEnter', 'Insert'].includes(e.code)) {
			if (isInput) e.target.blur();
			return setCursor({ ...cursor, editing: !cursor.editing });
		}
		if (isInput) return;
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
		const { row, column } = cursor ?? { row: deltaRow <= 0 ? data.length : -1, column: 0 };

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
		<div style={{ border: '1px var(--color-border) solid' }}>
			<div className='Table' ref={ref}>
				<table onWheel={e => {
					setViewIndex(idx => {
						queueMicrotask(() => setCursor(null));
						const newIdx = idx + (e.deltaY > 0 ? 1 : -1) * Math.ceil(viewSize / 2);
						return clamp(0, data.length <= viewSize ? 0 : data.length - viewSize, newIdx);
					});}}>
					<thead><tr>
						{markers && <td rowSpan={2} title='f is filter, + is whitelist, - is blacklist'
							className='ColumnHeader' style={{ minWidth: '3.5ch' }} onClick={()=>toggleSort('_sample')}>
						##{sort.column === '_sample' && <div className='SortShadow' style={{ [sort.direction < 0 ? 'top' : 'bottom']: -2 }}/>}</td>}
						{[...tables].map(([table, cls]) =>
							<td key={table} colSpan={cls.length}>{prettyTable(table)}</td>)}
					</tr><tr>
						{columns.map(({ id, name, width, description }) => <td title={description}
							className='ColumnHeader' style={{  width: width + .5 + 'ch' }} onClick={()=>(console.log(id) as any) || toggleSort(id)}>
							{name}{sort.column === id && <div className='SortShadow' style={{ [sort.direction < 0 ? 'top' : 'bottom']: -2 }}/>}
						</td>)}
					</tr></thead>
					<tbody> {data.slice(viewIndex, Math.max(0, viewIndex + viewSize - changesRows)).map((row, i) => {
						const idx = viewIndex + i;
						const marker = markers?.[idx];
						const rowChanges = wholeChangelog?.[row[0]];
						const isCompModified = rowChanges && columns.map(c => c.isComputed && rowChanges[c.id]?.length && rowChanges[c.id][rowChanges[c.id].length - 1].new !== 'auto');
						return <tr key={row[0] as any} style={{ backgroundColor: plotId === row[0] ? 'var(--color-area)' : 'unset' }}>
							{marker && <td onClick={(e) => pickEventForSampe(e.ctrlKey ? 'blacklist' : 'whitelist', row[0])}>
								<span className='Cell' style={{ color: marker.endsWith('+') ? 'var(--color-cyan)' :
									marker.endsWith('-') ? 'var(--color-magenta)' : 'unset' }}>{marker}</span>
							</td>}
							{columns.map((column, cidx) => {
								const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
								return <td key={column.id} title={cidx === 0 && column.name === 'time' ? `id=${row[0]}` : ''}
									onClick={() => setCursor({ row: idx, column: cidx, editing: !!curs })}
									style={{ borderColor: curs ? 'var(--color-active)' : 'var(--color-border)' }}>
									{curs?.editing ? <CellInput {...{ id: row[0], column, value: valueToString(row[cidx+1]) }}/> :
										<span className='Cell' style={{ width: column.width + 'ch' }}>
											{valueToString(row[cidx+1])}
											{isCompModified?.[cidx] && <span className='ModifiedMarker'/>}</span>}
								</td>;
							})}
						</tr>;})} </tbody>
					{averages && (<tfoot>
						<tr><td colSpan={columns.length} style={{ height: '0' }}></td></tr>
						{['median', 'mean', 'σ', 'σ / √n'].map((label, ari) => <tr key={label}>
							{averages.map((avgs, i) => {
								const isLabel = columns[i].type === 'time';
								return <td key={columns[i].id} style={{ borderColor: 'var(--color-text-dark)', textAlign: isLabel ? 'right' : 'unset', padding: isLabel ? '0 6px' : 0 }}>
									{isLabel ? label : avgs ? avgs[ari].toFixed?.(ari > 2 ? 3 : avgs[1] > 99 ? 1 : 2) : ''}</td>;
							})}
						</tr>)}
					</tfoot>)}
				</table>
			</div>
			{changesRows > 0 && <div id='changelog' style={{ fontSize: '14px', border: '1px var(--color-border) solid',
				height: 28 * changesRows - 12 + 'px', margin: '0 2px 2px 2px', padding: '4px', lineHeight: '22px', overflowY: 'scroll' }}>
				{changelog!.map(change => {
					const column = columns.find(c => c.id === change.column)!;
					const time = new Date(change.time * 1e3);
					const val = (str: string | null) =>
						str == null ? 'null' : column.type === 'time' ? new Date(parseInt(str)*1e3).toISOString().replace(/\..*|T/g, ' ') : str;
					return (<div key={JSON.stringify(change)} style={{ margin: '0' }}>
						<i style={{ color: 'var(--color-text-dark)' }}>[{time.toISOString().replace(/\..*|T/g, ' ').slice(0,-4)}] @{change.author} </i>
						<i style={{ color: columns[cursor!.column].id === column.id ? 'var(--color-active)' : 'unset' }}> <b>{column.fullName}</b></i>
						: {val(change.old)} -&gt; <b>{val(change.new)}</b>
					</div>);})}
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