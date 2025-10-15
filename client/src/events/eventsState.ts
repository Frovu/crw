import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { equalValues, type ChangeValue, type FeidRow, type FeidSrcRow, type SrcCHRow, type SrcEruptRow } from './events';
import type { ColumnDef, DataRow, Value } from './columns';

export const flaresLinks = {
	SFT: ['solarsoft_flr_start', 'start_time'],
	// NOA: ['noaa_flare_start', 'start_time'],
	DKI: ['donki_flr_id', 'id'],
	dMN: ['solardemon_flr_id', 'id'],
} as const;

export const cmeLinks = {
	LSC: ['lasco_cme_time', 'time'],
	DKI: ['donki_cme_id', 'id'],
} as const;

export const icmeLinks = {
	'R&C': ['rc_icme_time', 'time'],
} as const;

export type Sort = { column: string; direction: 1 | -1 };
export type Cursor = { row: number; column: number; entity: string; editing?: boolean; id: number };
const tables = ['feid', 'feid_sources', 'sources_erupt', 'sources_ch'] as const;
export type TableName = (typeof tables)[number];
const linkIds = [flaresLinks, cmeLinks, icmeLinks].flatMap((lnk) => Object.values(lnk).map((l) => l[0])) as string[];

export const [fIdIdx, chIdIdx, eruptIdIdx, inflIdIdx] = [1, 2, 3, 4];

const defaultSate = {
	cursor: null as Cursor | null,
	sort: { column: 'time', direction: 1 } as Sort,
	plotId: null as number | null,
	modifyId: null as number | null,
	modifySource: null as number | null,
	setStartAt: null as Date | null,
	setEndAt: null as Date | null,

	changes: Object.fromEntries(tables.map((t) => [t, [] as ChangeValue[]])) as { [t in TableName]: ChangeValue[] },
	created: Object.fromEntries(tables.map((t) => [t, [] as DataRow[]])) as { [t in TableName]: DataRow[] },
	deleted: Object.fromEntries(tables.map((t) => [t, [] as number[]])) as { [t in TableName]: number[] },
	columns: {} as { [t in TableName]?: ColumnDef[] },
	rawData: {} as { [t in TableName]?: DataRow[] },
	data: {} as { [t in TableName]?: DataRow[] },
};

type EventsState = typeof defaultSate & {
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
		toggleSort: (column, dir) => set((st) => ({ ...st, sort: { column, direction: dir ?? (st.sort.column === column ? -1 * st.sort.direction : 1) } })),
		escapeCursor: () =>
			set((st) => {
				st.cursor = st.cursor?.editing ? { ...st.cursor, editing: false } : null;
			}),
	})),
);

const applyChanges = (state: typeof defaultSate, tbl: TableName) => {
	const rawData = state.rawData[tbl];
	const deleted = state.deleted[tbl];
	const created = state.created[tbl];
	const columns = state.columns[tbl]!;
	const changes = state.changes[tbl];
	if (!rawData) return [];
	const data = [...rawData.map((r) => [...r]), ...created.map((r) => [...r])].filter((r) => !deleted.includes(r[0] as number)) as typeof rawData;
	for (const { id, column, value } of changes) {
		const row = data.find((r) => r[0] === id);
		const columnIdx = columns.findIndex((c) => c.id === column);
		if (row) row[columnIdx] = value;
	}
	if (tbl === 'sources_erupt') {
		const [i1, i2, i3] = ['flr_start', 'cme_time', 'rc_icme_time'].map((cid) => columns.findIndex((c) => c.id === cid));
		data.sort((a: any, b: any) => (a[i1] ?? a[i2] ?? a[i3]) - (b[i1] ?? b[i2] ?? b[i3]));
	} else {
		const sortIdx = columns.findIndex((c) => c.type === 'time');
		if (sortIdx > 0) data.sort((a: any, b: any) => a[sortIdx] - b[sortIdx]);
	}
	return data;
};

export const useTable = (tbl: TableName = 'feid') => ({
	data: useEventsState((st) => st.data[tbl])!,
	columns: useEventsState((st) => st.columns[tbl])!,
});

export const useFeidCursor = () => {
	const { data, columns } = useTable();
	const plotId = useEventsState((st) => st.plotId);

	const targetIdx = data.findIndex((r) => r[0] === plotId);
	const row = rowAsDict(data[targetIdx], columns) as FeidRow;
	const duration = row.duration;
	const start = row.time;
	const end = row.duration == null ? undefined : start && new Date(start?.getTime() + duration! * 36e5);
	return { duration, start, end, id: plotId, row };
};

export type RowDict = { [k: string]: Value | undefined };
export const rowAsDict = (row: any[] | undefined, columns: ColumnDef[]): RowDict => Object.fromEntries(columns.map((c, i) => [c.id, row?.[i] ?? null]));

export const useSources = () => {
	const plotId = useEventsState((st) => st.plotId);
	const src = useTable('feid_sources');
	const erupt = useTable('sources_erupt');
	const ch = useTable('sources_ch');
	if (!src.data || !erupt.data || !ch.data) return [];
	return src.data
		.filter((row) => row[fIdIdx] === plotId)
		.map((row) => {
			const source = rowAsDict(row, src.columns) as FeidSrcRow;
			if (row[chIdIdx]) {
				const found = ch.data.find((r) => r[0] === row[chIdIdx]);
				return { source, ch: found && (rowAsDict(found, ch.columns) as SrcCHRow) };
			} else if (row[eruptIdIdx]) {
				const found = erupt.data.find((r) => r[0] === row[eruptIdIdx]);
				return { source, erupt: found && (rowAsDict(found, erupt.columns) as SrcEruptRow) };
			}
			return { source };
		})
		.filter((a) => !!a);
};

export const useSource = <T extends 'sources_ch' | 'sources_erupt'>(tbl: T, soft = false): (T extends 'sources_ch' ? SrcCHRow : SrcEruptRow) | null => {
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
				: (src.data?.find((r) => r[idIdx] && r[fIdIdx] === plotId && r[inflIdIdx] === 'primary')?.[idIdx] ??
					src.data?.find((r) => r[idIdx] && r[fIdIdx] === plotId)?.[idIdx]);
	return !data || targetId == null ? null : (rowAsDict(data.find((row) => row[0] === targetId)!, columns) as any);
};

export const setRawData = (tbl: TableName, rdata: DataRow[], cols: ColumnDef[]) =>
	queueMicrotask(() =>
		useEventsState.setState((state) => {
			state.columns[tbl] = cols;
			state.rawData[tbl] = rdata;
			state.data[tbl] = applyChanges(state, tbl);
		}),
	);

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
			const colIdx = columns[tbl]!.findIndex((c) => c.id === column);

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
		const newRow = [id, ...columns.feid!.slice(1).map((col) => row[col.id as keyof typeof row] ?? null)];
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
			const newRow = [id, ...columns[tbl]!.slice(1).map((c) => null)] as DataRow;
			created[tbl] = [...created[tbl], newRow];
			data[tbl] = [...data[tbl]!, newRow];
		}

		const targetIdCol = tbl === 'sources_ch' ? 'ch_id' : 'erupt_id';
		const feidSrcRow = [feidSrcId, ...columns.feid_sources!.slice(1).map((c) => ({ [targetIdCol]: id, feid_id: feidId })[c.id] ?? null)] as DataRow;
		created.feid_sources = [...created.feid_sources, feidSrcRow];
		data.feid_sources = [...data.feid_sources!, feidSrcRow];

		state.modifySource = feidSrcId;
	});
	return id;
}

export function makeSourceChanges(tbl: 'sources_ch' | 'sources_erupt', row: SrcEruptRow | SrcCHRow) {
	makeChange(
		tbl,
		Object.entries(row)
			.filter((e) => e[0] !== 'id')
			.map(([column, value]) => ({ id: row.id, column, value: value ?? null, silent: !linkIds.includes(column) && !column.endsWith('source') })),
	);
}
