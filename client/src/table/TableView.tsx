import { useState, useRef, useEffect, useContext, useLayoutEffect, ChangeEvent } from 'react';
import { dispatchCustomEvent, useEventListener } from '../util';
import { ColumnDef, Cursor, DataContext, prettyTable, TableViewContext, parseColumnValue, isValidColumnValue, valueToString, TableContext, SettingsContext } from './Table';

function Row({ index, row }: { index: number, row: any[] } ) {
	const { markers, columns } = useContext(DataContext);
	const { makeChange, changelog: wholeChangelog } = useContext(TableContext);
	const { cursor, setCursor, plotId } = useContext(TableViewContext);
	const [values, setValues] = useState(Object.fromEntries(row.slice(1).map((value, i) =>
		[i, valueToString(value)])));
	const [validInputs, setValidInputs] = useState(Object.fromEntries(row.slice(1).map((r, i) => [i, true])));
	const marker = markers?.[index];
	const isSel = index === cursor?.row;
	const mLast = marker && marker[marker.length-1];
	const changelog = wholeChangelog?.[row[0]];
	const isCompModified = changelog && columns.map(c => c.isComputed && changelog[c.id]?.length && changelog[c.id][changelog[c.id].length - 1].new !== 'auto');

	const onChange = (i: number, update: boolean=false) => (e: ChangeEvent<HTMLInputElement>) => {
		const str = e.target.value;
		const auto = isCompModified?.[i] && str.trim() === 'auto';
		const value = str === '' ? null : auto ? 'auto' : parseColumnValue(str.trim(), columns[i]);
		const isValid = auto || value == null || isValidColumnValue(value, columns[i]);
		const isOk = isValid && (update ? makeChange({ id: row[0], column: columns[i], value }) : true);
		if (update) setCursor(cur => cur && ({ ...cur, editing: false }));
		setValues(vv => ({ ...vv, [i]: str }));
		setValidInputs(vv => ({ ...vv, [i]: isOk }));
	};

	return (
		<tr {...(plotId === row[0] && { style: { color: 'var(--color-cyan)' } })}>
			{marker && <td onClick={(e) => dispatchCustomEvent('sampleEdit', { action: e.ctrlKey ? 'blacklist' : 'whitelist', id: row[0] }  )}>
				<span className='Cell' style={{ color: mLast === '+' ? 'var(--color-cyan)' : mLast === '-' ? 'var(--color-magenta)' : 'unset' }}>{marker}</span>
			</td>}
			{columns.map((value, i) => {
				const curs = isSel && i === cursor?.column ? cursor : null;
				const width = { width: columns[i].width+.5+'ch' };
				return <td key={columns[i].id} onClick={() => setCursor({ row: index, column: i, editing: isSel && i === cursor?.column })}
					style={{ borderColor: !validInputs[i] ? 'var(--color-red)' : curs ? 'var(--color-active)' : 'var(--color-border)' }}>
					{!curs?.editing ?
						<span className='Cell' style={{ ...width }}>{values[i]}
							{isCompModified?.[i] && <span style={{ fontSize: '14px', display: 'inline-block', color: 'var(--color-magenta)', transform: 'translate(1px, -3px)' }}>*</span>}</span> :
						<input style={{ ...width, border: 'none', padding: 0, boxShadow: ' 0 0 16px 4px ' + (!validInputs[i] ? 'var(--color-red)' : 'var(--color-active)' ) }}
							autoFocus type='text' value={values[i]} onChange={onChange(i)} onBlur={onChange(i, true)}></input>}
				</td>;
			})}
		</tr>
	);
}

function ColumnHeader({ col }: { col: ColumnDef }) {
	const { sort, setSort } = useContext(TableViewContext);
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

const MAX_CHANGELOG_ROWS = 3;
export default function TableView({ viewSize: maxViewSize }: { viewSize: number }) {
	const { changes, changelog: wholeChangelog } = useContext(TableContext);
	const { data, columns, averages, markers } = useContext(DataContext);
	const { sort, setSort, cursor, setCursor } = useContext(TableViewContext);
	const { settings: { showChangelog } } = useContext(SettingsContext);
	const ref = useRef<HTMLDivElement>(null);
	const [viewIndex, setViewIndex] = useState(0);
	const viewSize = averages ? Math.max(2, maxViewSize - 4) : maxViewSize;

	const changelogEntry = (showChangelog || null) && cursor && wholeChangelog && data[cursor.row] && wholeChangelog[data[cursor.row][0]];
	const changelog = changelogEntry && Object.entries(changelogEntry)
		.filter(([col]) => columns.find(c => c.id === col))
		.flatMap(([col, chgs]) => chgs.map(c => ({ column: col, ...c })))
		.sort((a, b) => [a, b].map(chg => Math.abs(cursor.column - columns.findIndex(c => c.id === chg.column))).reduce((da,db)=>db-da) ); // ???
	// changelog?.map(chg => )
	const changesRows = Math.min(3, changelog?.length ?? 0);

	const updateViewIndex = (curs: Exclude<Cursor, null>) => {
		const newIdx = curs.row - 1 <= viewIndex ? curs.row - 1 : 
			(curs.row + MAX_CHANGELOG_ROWS >= viewIndex+viewSize ? curs.row - viewSize + MAX_CHANGELOG_ROWS + 1 : viewIndex);
		setViewIndex(Math.min(Math.max(newIdx, 0), data.length <= viewSize ? 0 : data.length - viewSize + changesRows));
	};

	useLayoutEffect(() => { // ??
		setViewIndex(Math.max(0, data.length - viewSize));
	}, [data.length, viewSize, sort]);
	useEffect(() => {
		if (!ref.current) return;
		ref.current.onwheel = e => setViewIndex(idx => {
			const table = ref.current?.children[0];
			if (!table?.contains(e.target as Node)) return idx;
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
		ref.current?.scrollTo({ left });
		const log = ref.current?.parentElement?.querySelector('#changelog');
		log?.scrollTo(0, log.scrollHeight);
	}, [cursor]); // eslint-disable-line

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (cursor && ['Enter', 'NumpadEnter', 'Insert'].includes(e.code)) {
			if (e.target instanceof HTMLInputElement)
				e.target.blur();
			return setCursor({ ...cursor, editing: !cursor.editing });
		}
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
	const tables = new Map<any, ColumnDef[]>(); // this is weird
	columns.forEach(col => tables.has(col.table) ? tables.get(col.table)?.push(col) : tables.set(col.table, [col]));
	return ( // https://stackoverflow.com/questions/43311943/prevent-content-from-expanding-grid-items
		<div style={{ minWidth: 0, maxWidth: 'fit-content', border: '1px solid var(--color-border)' }}>
			<div className='Table' ref={ref}>
				<table style={{ tableLayout: 'fixed', minWidth: 264 }}>
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
						{data.slice(viewIndex, viewIndex + viewSize - changesRows).map((row, i) =>
							<Row key={JSON.stringify(row)} {...{ index: i + viewIndex, row }}/>)}
					</tbody>
					{averages && (<tfoot style={{  }}>
						{['median', 'mean', 'σ', 'σ / √n'].map((label, ari) => <tr key={label}>
							{averages.map((avgs, i) => {
								const isLabel = columns[i].type === 'time';
								return <td style={{ borderColor: 'var(--color-text-dark)', textAlign: isLabel ? 'right' : 'unset', padding: isLabel ? '0 6px' : 0 }}>
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
					&nbsp;&nbsp;With [{changes.length}] unsaved{changes.length > 1 ? 's' : ''}&nbsp;
					</span>}
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
	);
}