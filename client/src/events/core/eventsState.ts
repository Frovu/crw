import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { equalValues, type ChangeValue } from './eventsSettings';
import type { ChangelogResponse, Column, StaticColumn, Tables } from '../../api';

export type TableValue = string | number | Date | null;
export type TableRow = TableValue[];

export type Sort = { column: string; direction: 1 | -1 };

export type Cursor = { row: number; column: number; entity: string; editing?: boolean; id: number };

export const compoundTables = {
	cme: ['lasco_cmes', 'donki_cmes', 'cactus_cmes'],
	icme: ['r_c_icmes'],
	flare: ['solarsoft_flares', 'donki_flares'],
} as const;

const editableTables = ['feid', 'feid_sources', 'sources_erupt', 'sources_ch'] as const;
export type EditableTable = keyof Tables & (typeof editableTables)[number];


type TableState<T extends EditableTable> = {
	changes: ChangeValue[];
	created: TableRow[];
	deleted: number[];
	columns: (T extends 'feid' ? Column : StaticColumn)[];
	rawData: TableRow[],
	data: TableRow[],
	changelog: null | ChangelogResponse
}

const defaultSate = {
	cursor: null as Cursor | null,
	sort: { column: 'time', direction: 1 } as Sort,
	plotId: null as number | null,
	modifyId: null as number | null,
	modifySource: null as number | null,
	setStartAt: null as Date | null,
	setEndAt: null as Date | null,

	tables: Object.fromEntries(editableTables.map((t) => [t, {
		changes: [] as any,
		created: [] as any,
		deleted: [] as any,
		columns: [] as any,
		rawData: [] as any,
		data: [] as any,
		changelog: null,
	}])) as { [t in EditableTable]: TableState<t> },
};

export type EventsState = typeof defaultSate & {
	setEditing: (val: boolean) => void;
	setModify: (val: number | null) => void;
	setModifySource: (val: number | null) => void;
	setStart: (val: Date | null) => void;
	setEnd: (val: Date | null) => void;
	setCursor: (cursor: EventsState['cursor']) => void;
	toggleSort: (column: string, dir?: Sort['direction']) => void;
	setPlotId: (setter: (a: EventsState['plotId']) => EventsState['plotId']) => void;
	escapeCursor: () => void;
};

export const useEventsState = create<EventsState>()(
	immer((set) => ({
		...defaultSate,
		setModifySource: (val) =>
			set((st) => {
				st.modifySource = val;
			}),
		setEditing: (val) =>
			set((st) => {
				if (st.cursor) st.cursor.editing = val;
			}),
		setModify: (val) =>
			set((st) => {
				st.modifyId = val;
				st.modifySource = null;
			}),
		setStart: (val) =>
			set((st) => {
				st.setStartAt = val;
				st.setEndAt = null;
			}),
		setEnd: (val) =>
			set((st) => {
				st.setEndAt = val;
			}),
		setCursor: (cursor) =>
			set((st) => {
				if (cursor?.entity === 'feid' && cursor.id !== (st.cursor?.id ?? st.plotId)) st.modifySource = null;
				if (['sources_erupt', 'sources_ch'].includes(cursor?.entity as any)) {
					const srcIdIdx = cursor?.entity === 'sources_ch' ? chIdIdx : eruptIdIdx;
					const src = st.data.feid_sources?.find((row) => row[srcIdIdx] === cursor?.id);
					if (src) {
						st.modifySource = src[0];
						st.plotId = src[fIdIdx] as number;
					}
				}
				st.cursor = cursor;
			}),
		setPlotId: (setter) =>
			set((st) => {
				st.plotId = setter(st.plotId);
				st.modifySource = null;
			}),
		toggleSort: (column, dir) =>
			set((st) => ({ ...st, sort: { column, direction: dir ?? (st.sort.column === column ? -1 * st.sort.direction : 1) } })),
		escapeCursor: () =>
			set((st) => {
				st.cursor = st.cursor?.editing ? { ...st.cursor, editing: false } : null;
			}),
	}))
);

export const useFeidCursor = () => {
	const { data, columns } = useTable();
	const plotId = useEventsState((st) => st.plotId);

	const targetIdx = data.findIndex((r) => r[0] === plotId);
	const row = rowAsDict<'feid'>(data[targetIdx], columns);
	const duration = row.duration;
	const start = row.time;
	const end = row.duration == null ? undefined : start && new Date(start?.getTime() + duration! * 36e5);
	return { duration, start, end, id: plotId, row };
};

export const rowAsDict = <T extends keyof Tables = never>(row: any[] | undefined, columns: Column[]) =>
	Object.fromEntries(columns.map((c, i) => [c.sql_name, row?.[i] ?? null])) as Tables[T];

export const useSources = () => {
	const plotId = useEventsState((st) => st.plotId);
	const src = useTable('feid_sources');
	const erupt = useTable('sources_erupt');
	const ch = useTable('sources_ch');
	if (!src.data || !erupt.data || !ch.data) return [];
	return src.data
		.filter((row) => row[fIdIdx] === plotId)
		.map((row) => {
			const source = rowAsDict<'feid_sources'>(row, src.columns);
			if (row[chIdIdx]) {
				const found = ch.data.find((r) => r[0] === row[chIdIdx]);
				return { source, ch: found && rowAsDict<'sources_ch'>(found, ch.columns) };
			} else if (row[eruptIdIdx]) {
				const found = erupt.data.find((r) => r[0] === row[eruptIdIdx]);
				return { source, erupt: found && rowAsDict<'sources_erupt'>(found, erupt.columns) };
			}
			return { source };
		})
		.filter((a) => !!a);
};

export const useSource = <T extends 'sources_ch' | 'sources_erupt'>(tbl: T, soft = false): Tables[T] | null => {
	const plotId = useEventsState((st) => st.plotId);
	const cursor = useEventsState((st) => st.cursor);
	const modifySource = useEventsState((st) => st.modifySource);
	const src = useTable('feid_sources');
	const { data, columns } = useTable(tbl);
	const idIdx = 'sources_erupt' === tbl ? eruptIdIdx : chIdIdx;
	const targetId = modifySource
		? (src.data?.find((row) => row[0] === modifySource)?.[idIdx] as number)
		: cursor?.entity === tbl
		? cursor.id!
		: !soft
		? null
		: src.data?.find((r) => r[idIdx] && r[fIdIdx] === plotId && r[inflIdIdx] === 'primary')?.[idIdx] ??
		  src.data?.find((r) => r[idIdx] && r[fIdIdx] === plotId)?.[idIdx];
	return !data || targetId == null ? null : (rowAsDict(data.find((row) => row[0] === targetId)!, columns) as any);
};

export const setRawData = (tbl: TableName, rdata: TableRow[], cols: Column[]) =>

export const discardChange = (tbl: TableName, { column, id }: ChangeValue) =>
	useEventsState.setState((state) => {
		state.changes[tbl] = state.changes[tbl].filter((c) => c.id !== id || column !== c.column);
		state.data[tbl] = applyChanges(state, tbl);
	});

export const discardCreated = (tbl: TableName, id: number) =>
	useEventsState.setState((state) => {
		state.created[tbl] = state.created[tbl].filter((r) => r[0] !== id);
		state.data[tbl] = applyChanges(state, tbl);
	});

export const discardDeleted = (tbl: TableName, id: number) =>
	useEventsState.setState((state) => {
		state.deleted[tbl] = state.deleted[tbl].filter((did) => did !== id);
		state.data[tbl] = applyChanges(state, tbl);
	});

export const resetChanges = (keepData: boolean) =>
	useEventsState.setState((state) => {
		for (const tbl of tables) {
			state.changes[tbl] = [];
			state.created[tbl] = [];
			state.deleted[tbl] = [];
			if (!keepData) state.data[tbl] = applyChanges(state, tbl);
		}
	});

export function deleteEvent(tbl: TableName, id: number) {
	useEventsState.setState((st) => {
		st.deleted[tbl] = [...st.deleted[tbl], id];
		if (['sources_ch', 'sources_erupt'].includes(tbl)) {
			const idIdx = 'sources_erupt' === tbl ? eruptIdIdx : chIdIdx;
			st.data.feid_sources
				?.filter((r) => r[idIdx] === id)
				.forEach((sRow) => {
					st.deleted.feid_sources = [...st.deleted.feid_sources, sRow[0]];
				});
		}
		st.data[tbl] = st.data[tbl]?.filter((r) => r[0] !== id);
	});
}

export function makeChange(tbl: TableName, chgs: ChangeValue | ChangeValue[]) {
	const changes = Array.isArray(chgs) ? (chgs as ChangeValue[]) : [chgs];

	useEventsState.setState((st) => {
		const { rawData, columns } = st;
		for (const [i, { id, value, column, fast, silent }] of changes.entries()) {
			const rawRow = rawData[tbl]!.find((r) => r[0] === id);
			const colIdx = columns[tbl]!.findIndex((c) => c.sql_name === column);

			st.changes[tbl] = [
				...st.changes[tbl].filter((c) => c.id !== id || column !== c.column),
				...(!equalValues(rawRow?.[colIdx] ?? null, value) ? [{ id, column, value, silent }] : []),
			];

			if (fast || i < changes.length - 1) {
				const row = st.data[tbl]!.find((r) => r[0] === id);
				if (row) row[colIdx] = value;
			} else {
				console.log('rendering', tbl);
				st.data[tbl] = applyChanges(st, tbl);
			}
		}
	});
}

export function createFeid(row: { time: Date; duration: number }) {
	const id = Date.now() % 1e6;
	useEventsState.setState((state) => {
		const { columns, data, created } = state;
		const newRow = [id, ...columns.feid!.slice(1).map((col) => row[col.sql_name as keyof typeof row] ?? null)];
		created.feid = [newRow as any, ...created.feid];
		data.feid = applyChanges(state, 'feid');
	});
	return id;
}

export function linkSource(tbl: 'sources_ch' | 'sources_erupt', feidId: number, sourceId?: number) {
	const feidSrcId = (Date.now() % 1e6) + 1e6;
	const id = sourceId ?? Date.now() % 1e6;
	useEventsState.setState((state) => {
		const { columns, data, created } = state;

		if (sourceId == null) {
			const newRow = [id, ...columns[tbl]!.slice(1).map((c) => null)] as TableRow;
			created[tbl] = [...created[tbl], newRow];
			data[tbl] = [...data[tbl]!, newRow];
		}

		const targetIdCol = tbl === 'sources_ch' ? 'ch_id' : 'erupt_id';
		const feidSrcRow = [
			feidSrcId,
			...columns.feid_sources!.slice(1).map((c) => ({ [targetIdCol]: id, feid_id: feidId }[c.sql_name] ?? null)),
		] as TableRow;
		created.feid_sources = [...created.feid_sources, feidSrcRow];
		data.feid_sources = [...data.feid_sources!, feidSrcRow];

		state.modifySource = feidSrcId;
	});
	return id;
}

export function makeSourceChanges<T extends 'sources_ch' | 'sources_erupt'>(tbl: T, row: Tables[T]) {
	makeChange(
		tbl,
		Object.entries(row)
			.filter((e) => e[0] !== 'id')
			.map(([column, value]) => ({
				id: row.id,
				column,
				value: value ?? null,
				silent: !linkIds.includes(column) && !column.endsWith('source'),
			}))
	);
}
