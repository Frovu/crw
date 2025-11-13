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
	type WheelEvent,
} from 'react';
import { clamp, cn, useEventListener, type Size } from '../../util';
import { parseColumnValue, isValidColumnValue, valueToString } from '../core/util';
import { color, openContextMenu } from '../../app';
import { useEntityCursor, useEventsState, type Cursor } from '../core/eventsState';
import type { Column } from '../../api';
import { makeChange, type EditableTable } from '../core/editableTables';
import { computeColumnWidth } from '../columns/columns';

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
		<>
			{/* <div className="TdOver" /> */}
			{children}
		</>
	);
}

type RowConstructor = (row: any[], idx: number, onClick: (i: number, cidx: number) => void, padding: number) => ReactNode;
type HeadConstructor = (columns: Column[], padding: number) => ReactNode;

type TableProps = {
	size: Size;
	entity: Cursor['entity'];
	data: any[][];
	focusIdx?: number;
	columns: Column[];
	row: RowConstructor;
	allowEdit?: boolean;
	tfoot?: ReactNode;
	onKeydown: (e: KeyboardEvent, curs: Cursor) => void;
};

export function TableWithCursor({
	entity,
	data,
	columns,
	focusIdx,
	allowEdit,
	row: rowCallback,
	tfoot,
	size,
	onKeydown,
}: TableProps) {
	const { setStartAt, setEndAt, plotId, modifyId, sort, toggleSort, setCursor, escapeCursor, setEditing } = useEventsState();
	const cursor = useEntityCursor(entity);

	const ref = useRef<HTMLDivElement | null>(null);

	const rowsHeight = size.height - 34;
	const rowH = devicePixelRatio === 1 ? 23.5 : Math.pow(Math.E, -2.35 * devicePixelRatio + 1.6) + 23;
	const viewSize = Math.max(0, Math.floor(rowsHeight / rowH));
	const hRem = rowsHeight % rowH;
	const padRow = hRem > viewSize ? 1 : 0;
	const padHeader = hRem - (viewSize / 2) * padRow;

	const headerHeight = 32 + padHeader;

	const [viewIndex, setViewIndex] = useState(Math.max(0, data.length - viewSize));

	const updateViewIndex = useCallback(
		(curs: Cursor) =>
			setViewIndex((vidx) => {
				const newIdx =
					curs.row - 1 <= vidx ? curs.row - 1 : curs.row + 1 >= vidx + viewSize ? curs.row - viewSize + 2 : vidx;

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

	useEffect(() => {
		const cell = cursor && (ref.current!.children[0]?.children[1].children[0]?.children[cursor.column] as HTMLElement);
		if (!cursor || !cell) return;
		const left = Math.max(0, cell.offsetLeft - (ref.current?.offsetWidth! * 2) / 3);
		ref.current?.scrollTo({ left });
	}, [cursor, ref.current?.offsetWidth]);

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

		if (!delta) return cursor && onKeydown?.(e, cursor);

		const [deltaRow, deltaCol] = delta;
		const { row, column } = cursor ?? {
			row: deltaRow > 0 ? -1 : data.length,
			column: deltaCol >= 0 ? -1 : columns.length,
		};

		if (e.ctrlKey && deltaRow !== 0) {
			let cur = clamp(0, data.length - 1, row + deltaRow);
			if (columns[column].dtype === 'time') {
				const curYear = (data[cur][column + 1] as Date).getUTCFullYear();

				while ((data[cur][column + 1] as Date).getUTCFullYear() === curYear && cur > 0 && cur < data.length - 1)
					cur += deltaRow;
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

	const onWheel = (e: WheelEvent) =>
		setViewIndex((idx) => {
			if (cursor) queueMicrotask(() => setCursor(null));
			const newIdx = idx + (e.deltaY > 0 ? 1 : -1) * Math.ceil(viewSize / 2);
			return clamp(0, data.length <= viewSize ? 0 : data.length - viewSize, newIdx);
		});

	return (
		<div ref={ref} className="absolute overflow-x-scroll no-scrollbar" style={{ ...size }}>
			<table className="table-fixed cursor-pointer w-0 h-0" onWheel={onWheel}>
				<thead>
					<tr className="h-2 break-words overflow-clip">
						{columns.map((col) => (
							<th
								className="relative leading-none text-sm border [clip-path:polygon(0_0,0_100%,100%_100%,100%_0)]"
								key={col.sql_name}
								onClick={() => entity === 'feid' && toggleSort(col.name)}
								title={`[${col.name}] ${col.description ?? ''}`}
								style={{ width: computeColumnWidth(col), height: headerHeight }}
							>
								<div style={{ maxHeight: headerHeight }}>{col.name}</div>
								{entity === 'feid' && sort.column === col.sql_name && (
									<div
										className={cn(
											'shadow-[0_0_28px_6px] absolute left-0 h-[1px] w-full shadow-active',
											sort.direction < 0 ? 'top-[-3px]' : 'bottom-[-3px]'
										)}
									/>
								)}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="[&_td]:border text-center whitespace-nowrap">
					{data
						.slice(viewIndex, Math.max(0, viewIndex + viewSize))
						.map((rw, ri) => rowCallback(rw, ri + viewIndex, onClick, padRow))}
				</tbody>
				{tfoot && <tfoot>{tfoot}</tfoot>}
			</table>
		</div>
	);
}
