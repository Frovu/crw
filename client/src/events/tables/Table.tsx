import {
	useState,
	useRef,
	useLayoutEffect,
	useEffect,
	type ChangeEvent,
	type ReactNode,
	type KeyboardEvent,
	useCallback,
	useMemo,
	type MouseEvent,
} from 'react';
import { clamp, cn, useEventListener, type Size } from '../../util';
import { parseColumnValue, isValidColumnValue, valueToString } from '../events';
import { color, openContextMenu } from '../../app';
import { makeChange, useEventsState, type Cursor, type TableName } from '../eventsState';
import type { Column } from '../../api';

export function DefaultHead({ columns, padHeader }: { padHeader: number; columns: Column[] }) {
	return (
		<tr>
			{columns.map((col) => (
				<td key={col.sql_name} title={`[${col.name}] ${col.description ?? ''}`} className="ColumnHeader" style={{ cursor: 'auto' }}>
					<div style={{ height: 20 + padHeader, lineHeight: 1, fontSize: 15 }}>{col.name}</div>
				</td>
			))}
		</tr>
	);
}

type DefaultRowParams = {
	row: any[];
	idx: number;
	columns: Column[];
	className: string;
	padRow: number;
	cursor: Cursor | null;
	before?: ReactNode;
	after?: ReactNode;
	title?: (cidx: number) => string;
	onClick: (e: MouseEvent, cidx: number) => void;
	contextMenuData: (cidx: number) => any;
	children: (cell: { column: Column; cidx: number; curs: Cursor | null }) => ReactNode;
};

export function DefaultRow({
	row,
	idx,
	columns,
	className,
	cursor,
	padRow,
	before,
	after,
	title,
	onClick,
	contextMenuData,
	children,
}: DefaultRowParams) {
	return (
		<tr style={{ height: 23 + padRow, fontSize: 15 }}>
			{before}
			{columns.map((column, cidx) => {
				const curs = cursor?.row === idx && cidx === cursor?.column ? cursor : null;
				return (
					<td
						className={cn(curs && 'outline-active outline-1', className)}
						key={column.sql_name}
						title={title?.(cidx) ?? `${column.name} = ${valueToString(row[cidx])}`}
						onClick={(e) => onClick(e, cidx)}
						onContextMenu={openContextMenu('events', contextMenuData(cidx))}
					>
						{children({ column, cidx, curs })}
					</td>
				);
			})}
			{after}
		</tr>
	);
}

export function DefaultCell({ column, children }: { column: Column; children: ReactNode }) {
	return (
		<span className="Cell">
			<div className="TdOver" />
			{children}
		</span>
	);
}

export function CellInput({
	id,
	column,
	value,
	table,
	options,
	change,
}: {
	id: number;
	column: Column;
	value: string;
	table: TableName;
	options?: string[];
	change?: (val: any) => boolean;
}) {
	const [invalid, setInvalid] = useState(false);
	const { escapeCursor } = useEventsState();

	return useMemo(() => {
		const doChange = (v: any) => (change ? change(v) : makeChange(table, { id, column: column.sql_name, value: v }));

		const onChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>, save: boolean = false) => {
			const str = e.target.value.trim();
			const val = str === '' ? null : str === 'auto' ? str : parseColumnValue(str, column);
			const isValid = ['auto', null].includes(val as any) || isValidColumnValue(val, column);
			const isOk = isValid && (!save || doChange(val));
			setInvalid(!isOk);
		};

		const inpStype = {
			width: '100%',
			borderWidth: 0,
			padding: 0,
			backgroundColor: color('bg'),
			boxShadow: column.dtype !== 'enum' ? ' 0 0 16px 4px ' + (invalid ? color('red') : color('active')) : 'unest',
		};

		return (
			<>
				{column.dtype === 'enum' && (
					<select
						autoFocus
						style={inpStype!}
						value={value}
						onChange={(e) => {
							onChange(e, true);
							escapeCursor();
						}}
					>
						{column.type === 'static' && !column.not_null && <option value="">&lt;null&gt;</option>}
						{column.type === 'static' &&
							(options ?? column.enum)?.map((val) => (
								<option key={val} value={val}>
									{val}
								</option>
							))}
					</select>
				)}
				{column.dtype !== 'enum' && (
					<input
						type="text"
						autoFocus
						style={inpStype!}
						defaultValue={value}
						onChange={onChange}
						onBlur={(e) => {
							e.target.value !== value && onChange(e, true);
							escapeCursor();
						}}
					/>
				)}
			</>
		);
	}, [column.type, id, JSON.stringify(options), invalid, table, value]); // eslint-disable-line
}

type RowConstructor = (row: any[], idx: number, onClick: (i: number, cidx: number) => void, padding: number) => ReactNode;
type HeadConstructor = (columns: Column[], padding: number) => ReactNode;

export function TableWithCursor({
	entity,
	data,
	columns,
	focusIdx,
	headSize,
	allowEdit,
	head: headCallback,
	row: rowCallback,
	tfoot,
	footer,
	hideBorder,
	size,
	onKeydown,
}: {
	size: Size;
	entity: string;
	data: any[][];
	focusIdx?: number;
	columns: Column[];
	headSize?: number;
	head?: HeadConstructor | null;
	row: RowConstructor;
	allowEdit?: boolean;
	tfoot?: ReactNode;
	footer?: ReactNode;
	hideBorder?: boolean;
	onKeydown?: (e: KeyboardEvent) => void;
}) {
	const { cursor: sCursor, setStartAt, setEndAt, plotId, modifyId, setCursor, escapeCursor, setEditing } = useEventsState();
	const cursor = sCursor?.entity === entity ? sCursor : null;

	const ref = useRef<HTMLDivElement | null>(null);

	const rowsHeight = size.height - (headSize ?? 28);
	const rowH = devicePixelRatio === 1 ? 23.5 : Math.pow(Math.E, -2.35 * devicePixelRatio + 1.6) + 23;
	const viewSize = Math.max(0, Math.floor(rowsHeight / rowH));
	const hRem = rowsHeight % rowH;
	const padRow = hRem > viewSize ? 1 : 0;
	const padHeader = hRem - (viewSize / 2) * padRow;

	const [viewIndex, setViewIndex] = useState(
		focusIdx == null ? Math.max(0, data.length - viewSize) : clamp(0, data.length - viewSize, Math.floor(focusIdx - viewSize / 2))
	);

	const updateViewIndex = useCallback(
		(curs: Cursor) =>
			setViewIndex((vidx) => {
				const newIdx = curs.row - 1 <= vidx ? curs.row - 1 : curs.row + 1 >= vidx + viewSize ? curs.row - viewSize + 2 : vidx;

				return clamp(0, data.length <= viewSize ? 0 : data.length - viewSize, newIdx);
			}),
		[data.length, viewSize]
	);

	useEventListener('escape', escapeCursor);

	useLayoutEffect(() => {
		if (cursor?.entity !== entity || cursor?.id === data[cursor.row]?.[0]) return;
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
		if (cursor || entity !== 'feid') return;
		const plotIdx = data.findIndex((r) => r[0] === plotId);
		if (plotIdx >= 0)
			setViewIndex((vidx) => {
				if (plotIdx <= vidx) return clamp(0, data.length - viewSize, plotIdx - 1);
				if (plotIdx >= vidx + viewSize - 1) return clamp(0, data.length - viewSize, plotIdx - viewSize + 2);
				return vidx;
			});
	}, [plotId, cursor, viewSize, entity]); // eslint-disable-line

	const hasHead = headCallback !== null;
	useEffect(() => {
		const cell = cursor && (ref.current!.children[0]?.children[hasHead ? 1 : 0].children[0]?.children[cursor.column] as HTMLElement);
		if (!cursor || !cell) return;
		const left = Math.max(0, cell.offsetLeft - (ref.current?.offsetWidth! * 2) / 3);
		ref.current?.scrollTo({ left });
	}, [cursor, ref.current?.offsetWidth, hasHead]);

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (setStartAt || setEndAt || modifyId) return;
		const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
		if (allowEdit && cursor && ['Enter', 'NumpadEnter'].includes(e.code)) {
			if (isInput) (e.target as any).blur();
			return setEditing(!cursor?.editing);
		}
		if (cursor?.editing) return;
		if ((!cursor || columns[cursor.column].dtype !== 'enum') && isInput) return;

		const set = (crs: Omit<Cursor, 'id'>) => {
			const curs = { ...crs, id: data[crs.row]?.[0] };
			setCursor(curs);
			updateViewIndex(curs);
			e.preventDefault();
		};

		if (cursor && e.ctrlKey && e.code === 'Home') return set({ entity, row: 0, column: cursor?.column ?? 0 });
		if (cursor && e.ctrlKey && e.code === 'End') return set({ entity, row: data.length - 1, column: cursor?.column ?? 0 });

		const delta =
			!e.altKey &&
			{
				ArrowUp: [-1, 0],
				ArrowDown: [1, 0],
				ArrowLeft: [0, -1],
				ArrowRight: [0, 1],
				PageUp: [-viewSize, 0],
				PageDown: [viewSize, 0],
				Home: [0, -columns.length],
				End: [0, columns.length],
			}[e.code];

		if (!delta || (sCursor && !cursor)) return onKeydown?.(e);

		const [deltaRow, deltaCol] = delta;
		const { row, column } = cursor ?? {
			row: deltaRow > 0 ? -1 : data.length,
			column: deltaCol >= 0 ? -1 : columns.length,
		};

		if (e.ctrlKey && deltaRow !== 0) {
			let cur = clamp(0, data.length - 1, row + deltaRow);
			if (columns[column].dtype === 'time') {
				const curYear = (data[cur][column + 1] as Date).getUTCFullYear();

				while ((data[cur][column + 1] as Date).getUTCFullYear() === curYear && cur > 0 && cur < data.length - 1) cur += deltaRow;
			} else {
				while (data[cur][column + 1] === null && cur > 0 && cur < data.length - 1) cur += deltaRow;
			}
			return set({ entity, row: cur, column });
		}
		set({
			entity,
			row: clamp(0, data.length - 1, row + deltaRow),
			column: clamp(0, columns.length - 1, column + deltaCol),
		});
	});

	const onClick = useCallback(
		(idx: number, cidx: number) => {
			const cur = {
				entity,
				row: idx,
				column: cidx,
				id: data[idx]?.[0],
				editing: allowEdit && cursor?.column === cidx && cursor?.row === idx,
			};
			setCursor(cur);
			updateViewIndex(cur);
		},
		[allowEdit, cursor?.column, cursor?.row, data, entity, setCursor, updateViewIndex]
	);

	return (
		<div className={cn('absolute p-[2px]', !hideBorder && 'border-1')} style={{ ...size }}>
			<div className="Table" ref={ref}>
				<table
					onWheel={(e) =>
						setViewIndex((idx) => {
							if (cursor) queueMicrotask(() => setCursor(null));
							const newIdx = idx + (e.deltaY > 0 ? 1 : -1) * Math.ceil(viewSize / 2);
							return clamp(0, data.length <= viewSize ? 0 : data.length - viewSize, newIdx);
						})
					}
				>
					{headCallback !== null && (
						<thead>{headCallback?.(columns, padHeader) ?? <DefaultHead {...{ columns, padHeader }} />}</thead>
					)}
					<tbody>
						{data
							.slice(viewIndex, Math.max(0, viewIndex + viewSize))
							.map((rw, ri) => rowCallback(rw, ri + viewIndex, onClick, padRow))}
					</tbody>
					{tfoot && <tfoot>{tfoot}</tfoot>}
				</table>
			</div>
			{footer}
		</div>
	);
}
