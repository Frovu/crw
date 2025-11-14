import {
	useState,
	useRef,
	useLayoutEffect,
	useEffect,
	type ReactNode,
	type KeyboardEvent,
	useCallback,
	type WheelEvent,
	useContext,
	type MouseEvent,
} from 'react';
import { clamp, cn, useEventListener, type Size } from '../../util';
import { valueToString } from '../core/util';
import { openContextMenu } from '../../app';
import { useEntityCursor, useEventsState } from '../core/eventsState';
import type { Column, Tables } from '../../api';
import { tableRowAsDict, type EditableTable, type TableValue } from '../core/editableTables';
import { computeColumnWidth } from '../columns/columns';
import type { CHEnt, EruptiveEvent, EruptTable } from '../core/sourceActions';
import { LayoutContext, type LayoutContextType } from '../../layout';
import { type TableAveragesData, TableAverages } from './TableAverages';

export type Cursor = { entity: TableEntity; row: number; column: number; id?: number; editing?: boolean };

export type TableEntity = EditableTable | CHEnt | EruptTable;

export type TableMenuDetails<T extends TableEntity = TableEntity> = {
	column: Column | SpecialColumn;
	event?: T extends EruptTable ? EruptiveEvent<T> : T extends keyof Tables ? Tables[T] : never;
	averages?: TableAveragesData;
};

export type SpecialColumn = {
	type: 'special';
	width: number;
} & Pick<Column, 'name' | 'description' | 'sql_name' | 'dtype'>;

export type TableParams = {
	showChangelog?: boolean;
	showAverages?: boolean;
	showIncludeMarkers?: boolean;
};

export const defaultTableParams: TableParams = {
	showChangelog: false,
	showAverages: true,
	showIncludeMarkers: true,
};

export type TableColumn = Column | SpecialColumn;
type TableProps = {
	size: Size;
	entity: TableEntity;
	data: TableValue[][];
	columns: TableColumn[];
	focusIdx?: number;
	enableEditing?: boolean;
	tfoot?: ReactNode;
	rowClassName?: (row: TableValue[], ridx: number) => string | undefined;
	cellContent?: (val: TableValue, column: TableColumn) => string | undefined;
	onKeydown?: (e: KeyboardEvent, curs: Cursor) => void;
	onClick?: (e: MouseEvent, row: TableValue[], column: TableColumn) => boolean | undefined;
};

export function EventsTable({
	entity,
	data,
	columns,
	focusIdx,
	enableEditing,
	tfoot,
	size,
	onKeydown,
	onClick,
	rowClassName,
	cellContent,
}: TableProps) {
	const { id: nodeId, params } = useContext(LayoutContext) as LayoutContextType<TableParams>;
	const { setStartAt, setEndAt, plotId, modifyId, sort, toggleSort, setCursor, escapeCursor, setEditing } = useEventsState();
	const cursor = useEntityCursor(entity);

	const showChangelog = entity === 'feid' && params.showChangelog && size.height > 300;
	const showAverages = entity === 'feid' && params.showAverages && size.height > 300;

	const ref = useRef<HTMLDivElement | null>(null);

	const rowsHeight = size.height - 34 - (showAverages ? 98 : 0);
	const rowH = devicePixelRatio === 1 ? 23.5 : Math.pow(Math.E, -2.35 * devicePixelRatio + 1.6) + 23;
	const viewSize = Math.max(0, Math.floor(rowsHeight / rowH));
	const hRem = rowsHeight % rowH;
	const padRow = hRem > viewSize ? 1 : 0;
	const padHeader = hRem - (viewSize / 2) * padRow;

	const headerHeight = 32 + padHeader;

	const sliceId = columns[0]?.sql_name === 'id' ? 1 : 0;

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

	// get cursor into view if set externally
	useEffect(() => {
		cursor && updateViewIndex(cursor);
	}, [cursor, updateViewIndex]);

	// change view on focusIdx changes
	useLayoutEffect(() => {
		if (cursor) return;
		const focus = focusIdx ? Math.floor(focusIdx - viewSize / 2) : data.length;
		setViewIndex(clamp(0, data.length - viewSize, focus));
	}, [cursor, data.length, focusIdx, viewSize]);

	// get plotted feid into view if cursor not set
	useLayoutEffect(() => {
		if (cursor || entity !== 'feid') return;
		const plotIdx = data.findIndex((r) => r[0] === plotId);
		if (plotIdx >= 0)
			setViewIndex((vidx) => {
				if (plotIdx <= vidx) return clamp(0, data.length - viewSize, plotIdx - 1);
				if (plotIdx >= vidx + viewSize - 1) return clamp(0, data.length - viewSize, plotIdx - viewSize + 2);
				return vidx;
			});
	}, [plotId, cursor, viewSize, entity, data]);

	// scroll cell into view horizontally
	useEffect(() => {
		const cell = cursor && (ref.current!.children[0]?.children[1].children[0]?.children[cursor.column] as HTMLElement);
		if (!cursor || !cell) return;
		const left = Math.max(0, cell.offsetLeft - (ref.current?.offsetWidth! * 2) / 3);
		ref.current?.scrollTo({ left });
	}, [cursor, ref.current?.offsetWidth]);

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (setStartAt || setEndAt || modifyId) return;

		const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
		if (enableEditing && cursor && ['Enter', 'NumpadEnter'].includes(e.code)) {
			if (isInput) (e.target as any).blur();
			return setEditing(!cursor?.editing);
		}

		if (!cursor || cursor?.editing) return;
		if (columns[cursor.column].dtype !== 'enum' && isInput) return;

		const set = (cur: Cursor) => {
			const curs = { ...cur, ...(sliceId ? { id: data[cur.row][0] as number } : null) };
			setCursor(curs);
			updateViewIndex(curs);
			e.preventDefault();
		};

		if (e.ctrlKey && e.code === 'Home') return set({ entity, row: 0, column: cursor?.column ?? 0 });
		if (e.ctrlKey && e.code === 'End') return set({ entity, row: data.length - 1, column: cursor?.column ?? 0 });

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
			column: deltaCol === 0 ? sliceId : deltaCol > 0 ? sliceId - 1 : columns.length,
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
			column: clamp(sliceId, columns.length - 1, column + deltaCol),
		});
	});

	const cellClick = (e: MouseEvent, row: number, column: number) => {
		if (!onClick?.(e, data[row], columns[column])) {
			const editing = enableEditing && cursor?.column === column && cursor?.row === row;
			const id = sliceId ? (data[row]?.[0] as number) : null;
			const cur = { entity, row, column, ...(editing && { editing }), ...(id && { id }) };
			setCursor(cur);
			updateViewIndex(cur);
		}
	};

	const onWheel = (e: WheelEvent) =>
		setViewIndex((idx) => {
			if (cursor) queueMicrotask(() => setCursor(null));
			const newIdx = idx + (e.deltaY > 0 ? 1 : -1) * Math.ceil(viewSize / 2);
			return clamp(0, data.length <= viewSize ? 0 : data.length - viewSize, newIdx);
		});

	return (
		<div ref={ref} className="overflow-x-scroll no-scrollbar" style={{ ...size }}>
			<table className="table-fixed cursor-pointer w-0 h-0" onWheel={onWheel}>
				<thead>
					<tr className="h-2 break-words overflow-clip">
						{columns.slice(sliceId).map((col) => (
							<th
								className="relative leading-none text-sm border [clip-path:polygon(0_0,0_100%,100%_100%,100%_0)]"
								key={col.sql_name}
								onClick={() => entity === 'feid' && toggleSort(col.name)}
								title={`[${col.name}] ${col.description ?? ''}`}
								style={{
									width: col.type === 'special' ? col.width : computeColumnWidth(col),
									height: headerHeight,
								}}
							>
								<div style={{ maxHeight: headerHeight }}>{col.name}</div>
								{entity === 'feid' && sort.column === col.name && (
									<div
										className={cn(
											'shadow-[0_0_28px_6px] absolute left-0 h-[2px] w-[calc(100%)] shadow-active',
											sort.direction < 0 ? 'top-[-2px]' : 'bottom-[-2px]'
										)}
									/>
								)}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="[&_td]:border [&_td]:overflow-clip text-center whitespace-nowrap text-[15px]">
					{data.slice(viewIndex, Math.max(0, viewIndex + viewSize)).map((row, rowi) => {
						const ridx = viewIndex + rowi;
						const className = rowClassName?.(row, ridx);
						const key = sliceId ? (row[0] as number) : `${row[0]}${row[1]}${row[2]}`;
						return (
							<tr key={key} className={className} style={{ height: 23 + padRow }}>
								{columns.slice(sliceId).map((column, scidx) => {
									const cidx = scidx + sliceId;
									const curs = cursor?.row === ridx && cidx === cursor?.column ? cursor : null;
									const title =
										column.name === 'time' && sliceId
											? `id = ${row[0]}`
											: `${column.name} = ${valueToString(row[cidx])}`;
									return (
										<td
											className={curs ? 'outline-active outline-1' : undefined}
											key={column.sql_name}
											title={title}
											onClick={(e) => cellClick(e, ridx, cidx)}
											onContextMenu={openContextMenu('events', {
												nodeId,
												column,
												event: tableRowAsDict(row, columns as Column[]),
											})}
										>
											{cellContent?.(row[cidx], column) ?? valueToString(row[cidx])}
										</td>
									);
								})}
							</tr>
						);
					})}
				</tbody>
				{showAverages && (
					<tfoot>
						<TableAverages data={data} columns={columns} />
					</tfoot>
				)}
			</table>
		</div>
	);
}
