import { useState, useRef, useContext, useLayoutEffect, useEffect,
	type ChangeEvent, type ReactNode, type KeyboardEvent, useCallback, useMemo } from 'react';
import { clamp, useEventListener, type Size } from '../../util';
import { TableViewContext, valueToString, parseColumnValue, isValidColumnValue, 
	MainTableContext, type TableParams, getChangelogEntry, type ChangeLogEntry } from '../events';
import { pickEventForSample } from '../sample';
import { openContextMenu } from '../../app';
import { LayoutContext, type LayoutContextType } from '../../layout';
import type { ColumnDef } from '../columns';
import { makeChange, useEventsState, type Cursor, type TableName } from '../eventsState';

export function DefaultHead({ columns, padHeader }: { padHeader: number, columns: ColumnDef[] } ) {
	return <tr>{columns.map((col) =>
		<td key={col.id} title={`[${col.name}] ${col.description ?? ''}`} className='ColumnHeader' style={{ cursor: 'auto' }}>
			<div style={{ height: 20 + padHeader, lineHeight: 1, fontSize: 15 }}>{col.name}</div>
		</td>)}
	</tr>;
}

export function CellInput({ id, column, value, table, options, change }:
{ id: number, column: ColumnDef, value: string, table: TableName, options?: string[], change?: (val: any) => boolean }) {
	const [invalid, setInvalid] = useState(false);
	const { escapeCursor } = useEventsState();

	return useMemo(() => {
		const doChange = (v: any) => change ? change(v) : makeChange(table, { id, column: column.id, value: v });

		const onChange = (e: ChangeEvent<HTMLInputElement|HTMLSelectElement>, save: boolean=false) => {
			const str = e.target.value.trim();
			const val = str === '' ? null : str === 'auto' ? str : parseColumnValue(str, column);
			const isValid = ['auto', null].includes(val as any) || isValidColumnValue(val, column);
			const isOk = isValid && (!save || doChange(val));
			setInvalid(!isOk);
		};
	
		const inpStype = { width: '100%', borderWidth: 0, padding: 0, backgroundColor: 'var(--color-bg)',
			boxShadow: column.type !== 'enum' ? (' 0 0 16px 4px ' + (invalid ? 'var(--color-red)' : 'var(--color-active)')) : 'unest' };

		return <>
			{column.type === 'enum' && <select autoFocus style={inpStype!}
				value={value} onChange={e => { onChange(e, true); escapeCursor(); }}>
				{!options && <option value=''></option>}
				{(options ?? column.enum)?.map(val => <option key={val} value={val}>{val}</option>)}
			</select>}
			{column.type !== 'enum' &&  <input type='text' autoFocus style={inpStype!}
				defaultValue={value} onChange={onChange}
				onBlur={e => { e.target.value !== value && onChange(e, true); escapeCursor(); }}/>}
		</>;
	}, [column.type, id, JSON.stringify(options), invalid, table, value]); // eslint-disable-line
}

type RowConstructor = (row: any[], idx: number, onClick: (i: number, cidx: number) => void, padding: number) => ReactNode;
type HeadConstructor = (columns: ColumnDef[], padding: number) => ReactNode;

export function TableWithCursor({ entity, data, columns, focusIdx, headSize, allowEdit,
	head: headCallback, row: rowCallback, tfoot, footer, hideBorder, size, onKeydown }: {
	size: Size,
	entity: string,
	data: any[][],
	focusIdx?: number,
	columns: ColumnDef[],
	headSize?: number,
	head?: HeadConstructor | null,
	row: RowConstructor,
	allowEdit?: boolean,
	tfoot?: ReactNode,
	footer?: ReactNode,
	hideBorder?: boolean,
	onKeydown?: (e: KeyboardEvent) => void
}) {
	const { cursor: sCursor, setStartAt, setEndAt, plotId, modifyId, setCursor, escapeCursor, setEditing } = useEventsState();
	const cursor = sCursor?.entity === entity ? sCursor : null;

	const ref = useRef<HTMLDivElement | null>(null);

	const rowsHeight = size.height - (headSize ?? 28);
	const rowH = devicePixelRatio < 1 ? 24 + (2 / devicePixelRatio) : 25;
	const viewSize = Math.max(0, Math.floor(rowsHeight / rowH));
	const hRem = rowsHeight % rowH;
	const padRow = hRem > viewSize ? 1 : 0;
	const padHeader = (hRem - viewSize * padRow);

	const [viewIndex, setViewIndex] = useState(focusIdx == null ? Math.max(0, data.length - viewSize) :
		clamp(0, data.length - viewSize, Math.floor(focusIdx - viewSize / 2)));

	const updateViewIndex = useCallback((curs: Cursor) => setViewIndex(vidx => {
		const newIdx = curs.row - 1 <= vidx ? curs.row - 1 : 
			(curs.row + 1 >= vidx + viewSize ? curs.row - viewSize + 2 : vidx);
		
		return clamp(0, data.length <= viewSize ? 0 : (data.length - viewSize), newIdx); 
	}), [data.length, viewSize]);

	useEventListener('escape', escapeCursor);

	useLayoutEffect(() => {
		if (cursor?.entity !== entity || cursor?.id === data[cursor.row]?.[0]) 
			return;
		setCursor(null);
		setViewIndex(clamp(0, data.length - viewSize, focusIdx ?? data.length));
	}, [cursor, data, entity, focusIdx, setCursor, viewSize]);

	useEffect(() => {
		cursor && updateViewIndex(cursor);
	}, [cursor, updateViewIndex]);

	useLayoutEffect(() => {
		if (cursor) return;
		const focus = focusIdx ? Math.floor(focusIdx - viewSize / 2) : data.length;
		setViewIndex(clamp(0, data.length - viewSize, focus));
	}, [cursor, data.length, focusIdx, viewSize]);

	useLayoutEffect(() => {
		if (cursor || entity !== 'feid')
			return;
		const plotIdx = data.findIndex(r => r[0] === plotId);
		if (plotIdx >= 0)
			setViewIndex(vidx => {
				if (plotIdx <= vidx)
					return clamp(0, data.length - viewSize, plotIdx - 1);
				if (plotIdx >= vidx + viewSize - 1)
					return clamp(0, data.length - viewSize, plotIdx - viewSize + 2);
				return vidx;
			});
	}, [plotId, cursor, data, viewSize, entity]);

	const hasHead = headCallback !== null;
	useEffect(() => {
		const cell = cursor && ref.current!.children[0]
			?.children[hasHead ? 1 : 0].children[0]?.children[cursor.column] as HTMLElement;
		if (!cursor || !cell) return;
		const left = Math.max(0, cell.offsetLeft - ref.current?.offsetWidth! * 2/ 3);
		ref.current?.scrollTo({ left });
	}, [cursor, ref.current?.offsetWidth, hasHead]);

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (setStartAt || setEndAt || modifyId)
			return;
		const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
		if (allowEdit && cursor && ['Enter', 'NumpadEnter'].includes(e.code)) {
			if (isInput) (e.target as any).blur();
			return setEditing(!cursor?.editing);
		}
		if (cursor?.editing)
			return;
		if ((!cursor || columns[cursor.column].type !== 'enum') && isInput)
			return;

		const set = (crs: Omit<Cursor, 'id'>) => {
			const curs = { ...crs, id: data[crs.row]?.[0] };
			setCursor(curs);
			updateViewIndex(curs);
			e.preventDefault(); };
		
		if (cursor && e.ctrlKey && e.code === 'Home')
			return set({ entity, row: 0, column: cursor?.column ?? 0 });
		if (cursor && e.ctrlKey && e.code === 'End')
			return set({ entity, row: data.length - 1, column: cursor?.column ?? 0 });

		const delta = !e.altKey && {
			'ArrowUp': [-1, 0],
			'ArrowDown': [1, 0],
			'ArrowLeft': [0, -1],
			'ArrowRight': [0, 1],
			'PageUp': [-viewSize, 0],
			'PageDown': [viewSize, 0],
			'Home': [0, -columns.length],
			'End': [0, columns.length]
		}[e.code];

		if (!delta || (sCursor && !cursor))
			return onKeydown?.(e);
	
		const [deltaRow, deltaCol] = delta;
		const { row, column } = cursor ?? {
			row: deltaRow > 0 ? -1 : data.length,
			column: deltaCol >= 0 ? -1 : columns.length };

		if (e.ctrlKey && deltaRow !== 0) {
			let cur = clamp(0, data.length - 1, row + deltaRow);
			if (columns[column].type === 'time') {
				const curYear = (data[cur][column + 1] as Date).getUTCFullYear();

				while ((data[cur][column + 1] as Date).getUTCFullYear() === curYear
						&& cur > 0 && cur < data.length - 1)
					cur += deltaRow;
			} else {
				while (data[cur][column + 1] === null
						&& cur > 0 && cur < data.length - 1)
					cur += deltaRow;
			}
			return set({ entity, row: cur, column });
		}
		set({
			entity,
			row: clamp(0, data.length - 1, row + deltaRow),
			column: clamp(0, columns.length - 1, column + deltaCol)
		});		
	});

	const onClick = useCallback((idx: number, cidx: number) => {
		const cur = { entity, row: idx, column: cidx, id: data[idx]?.[0],
			editing: allowEdit && cursor?.column === cidx && cursor?.row === idx };
		setCursor(cur);
		updateViewIndex(cur);
	}, [allowEdit, cursor?.column, cursor?.row, data, entity, setCursor, updateViewIndex]);

	return <div style={{ position: 'absolute', top: `calc(100% - ${size.height - (hideBorder ? 1 : 0)}px)`,
		border: hideBorder ? undefined : '1px var(--color-border) solid', maxHeight: size.height, maxWidth: size.width, overflow: 'clip' }}>
		<div className='Table' style={{ position: 'relative' }} ref={ref}>
			<table onWheel={e => setViewIndex(idx => {
				if (cursor)
					queueMicrotask(() => setCursor(null));
				const newIdx = idx + (e.deltaY > 0 ? 1 : -1) * Math.ceil(viewSize / 2);
				return clamp(0, data.length <= viewSize ? 0 : data.length - viewSize, newIdx);
			})}>
				{headCallback !== null && <thead>{headCallback?.(columns, padHeader) ?? <DefaultHead {...{ columns, padHeader }}/>}</thead>}
				<tbody>{data.slice(viewIndex, Math.max(0, viewIndex + viewSize))
					.map((rw, ri) => rowCallback(rw, ri + viewIndex, onClick, padRow))}</tbody> 
				{tfoot && <tfoot>{tfoot}</tfoot> }
			</table>
		</div>
		{footer}
	</div>;
}

export default function TableView({ size, averages, entity }: {
	size: Size,
	entity: string,
	averages?: (null | number[])[],
}) {
	const { id: nodeId, params } = useContext(LayoutContext) as LayoutContextType<TableParams>;
	const { changelog: wholeChangelog, rels: relsNames } = useContext(MainTableContext);
	const { data, columns, markers, includeMarkers } = useContext(TableViewContext);
	const viewState = useEventsState();
	const { plotId, sort, cursor: sCursor, setStartAt, setEndAt, modifyId,
		changes, created, deleted, toggleSort, setPlotId } = viewState;
	const [changesHovered, setChangesHovered] = useState(false);
	const showChangelog = params?.showChangelog && size.height > 300;
	const showAverages = params?.showAverages && size.height > 300;
	const hideHeader = params?.hideHeader && size.height < 480;
	const cursor = sCursor?.entity === entity ? sCursor : null;

	const incMarkWidth = includeMarkers && Math.min(16, Math.max.apply(null, includeMarkers.map(m => m?.length)));

	const cursCol = cursor && columns[cursor?.column]?.id;
	const changelogCols = (showChangelog || null) && cursor && wholeChangelog
		&& data[cursor.row] && columns.map(c => [c.id, getChangelogEntry(wholeChangelog, data[cursor.row][0], c.id)]);
	const changelog = changelogCols?.filter(c => !!c[1])
		.flatMap(([col, chgs]) => (chgs as ChangeLogEntry).map(c => ({ column: col, ...c })))
		.sort((a, b) => b.time - a.time)
		.sort((a, b) => (cursCol === b.column ? 1 : 0) - (cursCol === a.column ? 1 : 0));
	const changeCount = [changes, created, deleted]
		.flatMap(Object.values).reduce((a, b) => a + b.length, 0);

	useEffect(() => {
		if (changeCount === 0)
			setChangesHovered(false);
	}, [changeCount]);

	const onKeydown = useCallback((e: KeyboardEvent) => {
		if (cursor && ['-', '+', '='].includes(e.key))
			return pickEventForSample('-' === e.key ? 'blacklist' : 'whitelist', data[cursor.row][0]);
	}, [cursor, data]);

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (setStartAt || setEndAt || modifyId)
			return;
		if (cursor?.editing)
			return;

		if (cursor && ['-', '+', '='].includes(e.key))
			return pickEventForSample('-' === e.key ? 'blacklist' : 'whitelist', data[cursor.row][0]);
	});
	
	const simulateKey = (key: string, ctrl: boolean=false) =>
		() => document.dispatchEvent(new KeyboardEvent('keydown', { code: key, ctrlKey: ctrl }));

	const rels = new Map<any, ColumnDef[]>();
	columns.forEach(col => rels.has(col.rel) ? rels.get(col.rel)?.push(col) : rels.set(col.rel, [col]));

	return <TableWithCursor {...{
		data, columns, onKeydown, entity,
		allowEdit: true, size,
		headSize: (hideHeader ? 0 : 93) + (showAverages ? 107 : 0) + (!hideHeader && showChangelog ? 54 : 0),
		head: hideHeader ? null : (cols, padH) => {
			const padTableH = Math.floor(padH / 3);
			const columnH = 38 + padH - padTableH;
			return <><tr style={{ fontSize: 15 }}>
				{markers && <td rowSpan={2} title='f is for filter, + is whitelist, - is blacklist'
					className='ColumnHeader' style={{ minWidth: '3.5ch' }} onClick={() => toggleSort('_sample')}>
				##{sort.column === '_sample' && <div className='SortShadow' style={{ [sort.direction < 0 ? 'top' : 'bottom']: -2 }}/>}</td>}
				{[...rels].map(([rel, cls]) =>
					<td className='ColumnHeader' key={rel} style={{ clipPath: 'none' }} colSpan={cls.length}>
						<div style={{ height: 22 + padTableH }}>
							{cls.length > 1 ? relsNames[rel] : rel}</div></td>)}
				{includeMarkers && <td rowSpan={2} title='Event included from samples:'
					className='ColumnHeader' style={{ minWidth: '3.5ch' }}>#S</td>}
			</tr><tr style={{ fontSize: 15 }}>
				{columns.map((col) => <td key={col.id} title={`[${col.name}] ${col.description ?? ''}`}
					className='ColumnHeader' onClick={() => toggleSort(col.id)}
					onContextMenu={openContextMenu('events', { nodeId, header: col })}>
					<div style={{ height: columnH, lineHeight: 1 }}><span>{col.name}</span>
						{sort.column === col.id && <div className='SortShadow' style={{ [sort.direction < 0 ? 'top' : 'bottom']: -2 }}/>}</div>
				</td>)}
			</tr></>; },
		row: (row, idx, onClick, padRow) => {
			const marker = markers?.[idx];
			const isCompModified = columns.map(c => {
				if (!c.isComputed) return false;
				const chgs = getChangelogEntry(wholeChangelog, row[0], c.id)?.sort((a, b) => b.time - a.time);
				if (!chgs?.length) return false;
				return chgs[0].new !== 'auto' && chgs[0].special !== 'import';
			});
			return <tr key={row[0]} style={{ height: 23 + padRow, fontSize: 15,
				...(plotId === row[0] && { backgroundColor: 'var(--color-area)' }) }}>
				{marker && <td title='f: filtered; + whitelisted; - blacklisted'
					onClick={(e) => pickEventForSample(e.ctrlKey ? 'blacklist' : 'whitelist', row[0])}>
					<span className='Cell' style={{ color: marker.endsWith('+') ? 'var(--color-cyan)' :
						marker.endsWith('-') ? 'var(--color-magenta)' : 'unset' }}>{marker}</span>
				</td>}
				{columns.map((column, cidx) => {
					const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
					const value = valueToString(row[cidx+1]);
					return <td key={column.id} title={cidx === 0 && column.name === 'time' ? `id = ${row[0]}` : `${column.fullName} = ${value}`}
						onClick={e => {
							if (setEndAt || setEndAt || modifyId)
								return;
							onClick(idx, cidx);
							if (e.ctrlKey)
								setPlotId(() => row[0]); }}
						onContextMenu={openContextMenu('events', { nodeId, cell: { id: row[0], value: row[cidx+1], column } })}
						style={{ borderColor: curs ? 'var(--color-active)' : 'var(--color-border)' }}>
						{curs?.editing ? <CellInput {...{
							table: entity as any,
							id: row[0],
							column,
							value
						}}/> :
							<span className='Cell' style={{ width: column.width + 'ch' }}>
								<div className='TdOver'/>
								{value}
								{isCompModified?.[cidx] && <span className='ModifiedMarker'/>}</span>}
					</td>;
				})}
				{includeMarkers?.[idx] && <td title='Included in these samples'>
					<span style={{ width: incMarkWidth! + 2 + 'ch' }} className='Cell'>{includeMarkers?.[idx]}</span>
				</td>}
			</tr>;},
		tfoot: showAverages && <>
			<tr style={{ height: 0 }}><td colSpan={columns.length} style={{ height: 1, borderTop: 'none' }}></td></tr>
			{['median', 'mean', 'σ', 'σ / √n'].map((label, ari) => <tr key={label} style={{ height: 24, fontSize: 15 }}>
				{markers && <td style={{ borderColor: 'transparent' }}/>}
				{averages?.map((avgs, i) => {
					const isLabel = columns[i].type === 'time';
					const val = avgs?.[ari];
					return <td key={columns[i].id} style={{ borderColor: 'var(--color-grid)',
						textAlign: isLabel ? 'right' : 'unset', padding: isLabel ? '0 6px' : 0 }}
					onContextMenu={openContextMenu('events', { nodeId, averages: {
						averages, label, row: ari, column: i } })}
					title={(!isLabel && val?.toString()) || ''}>
						{isLabel ? label : val ?  val.toFixed?.(ari > 2 ? 3 : avgs[1] > 99 ? 1 : 2) : ''}</td>;
				})}
			</tr>)}</>,
		footer: hideHeader ? null : <>{showChangelog && <div style={{ position: 'relative', display: 'flex',
			flexDirection: 'column-reverse', fontSize: 14, border: '1px var(--color-border) solid',
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
					{change.special && <i style={{ color: 'var(--color-text-dark)' }}> ({change.special})</i>}
				</div>);}) : <div className='Center' style={{ color: 'var(--color-text-dark)' }}>NO CHANGES</div>}
		</div>}
		<div style={{ padding: '0 2px 2px 4px', display: 'flex', justifyContent: 'space-between', alignContent: 'bottom' }}>
			<span style={{ color: 'var(--color-text-dark)', fontSize: 14, overflow: 'clip', whiteSpace: 'nowrap', minWidth: 0 }}>
				<span style={{ color: 'var(--color-active)' }}> [{data.length}]</span>
				{changeCount > 0 && <div style={{ display: 'inline-flex', width: 160, height: 19, justifyContent: 'center', gap: 12 }}
					onClick={e => e.stopPropagation()} onMouseEnter={() => setChangesHovered(true)} onMouseLeave={() => setChangesHovered(false)}>
					{!changesHovered && <span style={{ color: 'var(--color-red)', fontSize: 14 }}>
						&nbsp;&nbsp;With [{changeCount}] unsaved&nbsp;
					</span>}
					{changesHovered && <>
						<button className='TextButton' style={{ lineHeight: 1 }} onClick={simulateKey('KeyS', true)}>save</button>
						<button className='TextButton' style={{ lineHeight: 1 }} onClick={simulateKey('KeyX', true)}>discard</button>
					</>}
				</div>}
			</span>
			<span style={{ display: 'inline-flex', gap: '2px', fontSize: 16 }}>
				<button className='TableControl' onClick={simulateKey('ArrowUp')}><span>↑</span></button>
				<button className='TableControl' onClick={simulateKey('ArrowDown')}><span>↓</span></button>
				<button className='TableControl' onClick={simulateKey('Home', true)}><span>H</span></button>
				<button className='TableControl' onClick={simulateKey('End', true)}><span>E</span></button>
				<button className='TableControl' onClick={simulateKey('ArrowLeft')}><span>←</span></button>
				<button className='TableControl' onClick={simulateKey('ArrowRight')}><span>→</span></button>
			</span>
		</div></>
	}}/>;
}