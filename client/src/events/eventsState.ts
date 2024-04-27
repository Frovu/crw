import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { equalValues, type ChangeValue } from './events';
import type { ColumnDef, DataRow, Value } from './columns';

export const flaresLinks = {
	SFT: ['solarsoft_flr_start', 'start_time'],
	NOA: ['noaa_flare_start', 'start_time'],
	DKI: ['donki_flr_id', 'id'],
	dMN: ['solardemon_flr_id', 'id']
} as const;

export const cmeLinks = {
	LSC: ['lasco_cme_time', 'time'],
	DKI: ['donki_cme_id', 'id']
} as const;

export const icmeLinks = {
	'R&C': 'rc_icme_time'
} as const;

export type Sort = { column: string, direction: 1 | -1 };
export type Cursor = { row: number, column: number, entity: string, editing?: boolean, id: number };
const tables = ['feid', 'feid_sources', 'sources_erupt', 'sources_ch'] as const;
export type TableName = typeof tables[number];
const linkIds = [flaresLinks, cmeLinks, icmeLinks].flatMap(lnk => Object.values(lnk).map(l => l[0])) as string[];

export const [fIdIdx, chIdIdx, eruptIdIdx] = [1, 2, 3];

const defaultSate = {
	cursor: null as Cursor | null,
	sort: { column: 'time', direction: 1 } as Sort,
	plotId: null as number | null,
	modifyId: null as number | null,
	modifySource: null as number | null,
	setStartAt: null as Date | null,
	setEndAt: null as Date | null,

	changes: Object.fromEntries(tables.map(t => [t, [] as ChangeValue[]])) as { [t in TableName]: ChangeValue[] },
	created: Object.fromEntries(tables.map(t => [t, [] as number[]])) as { [t in TableName]: number[] },
	deleted: Object.fromEntries(tables.map(t => [t, [] as number[]])) as { [t in TableName]: number[] },
	columns: {} as { [t in TableName]?: ColumnDef[] },
	rawData: {} as { [t in TableName]?: DataRow[] },
	data:    {} as { [t in TableName]?: DataRow[] },
};

type EventsState = typeof defaultSate & {
	setEditing: (val: boolean) => void,
	setModify: (val: number | null) => void,
	setModifySource: (val: number | null) => void,
	setStart: (val: Date | null) => void,
	setEnd: (val: Date | null) => void,
	setCursor: (cursor: EventsState['cursor']) => void,
	toggleSort: (column: string, dir?: Sort['direction']) => void,
	setPlotId: (setter: (a: EventsState['plotId']) => EventsState['plotId']) => void,
	escapeCursor: () => void,

};

export const useEventsState = create<EventsState>()(
	immer(
		set => ({
			...defaultSate,
			setModifySource: (val) => set(st => { st.modifySource = val; }),
			setEditing: (val) => set(st => { if (st.cursor) st.cursor.editing = val; }),
			setModify: (val) => set(st => { st.modifyId = val; st.modifySource = null; }),
			setStart:  (val) => set(st => { st.setStartAt = val; st.setEndAt = null; }),
			setEnd:    (val) => set(st => { st.setEndAt = val; }),
			setCursor: (cursor) => set(st => {
				if (cursor?.entity === 'feid' && cursor.id !== (st.cursor?.id ?? st.plotId))
					st.modifySource = null;
				if (['sources_erupt', 'sources_ch'].includes(cursor?.entity as any)) {
					const srcIdIdx = cursor?.entity === 'sources_ch' ? chIdIdx : eruptIdIdx;
					const src = st.data.feid_sources?.find(row => row[srcIdIdx] === cursor?.id);
					if (src) {
						st.modifySource = src[0];
						st.plotId = src[fIdIdx] as number;
					}
				}
				st.cursor = cursor;
			}),
			setPlotId: (setter) => set(st => {
				st.plotId = setter(st.plotId);
				st.modifySource = null;
			}),
			toggleSort: (column, dir) => set(st => ({ ...st, sort: { column,
				direction: dir ?? (st.sort.column === column ? -1 * st.sort.direction : 1) } })),
			escapeCursor: () => set(st => { st.cursor = st.cursor?.editing ? { ...st.cursor, editing: false } : null; })
		})
	)
);

const applyChanges = (state: typeof defaultSate, tbl: TableName) => {
	const rawData = state.rawData[tbl];
	const deleted = state.deleted[tbl];
	const created = state.created[tbl];
	const columns = state.columns[tbl]!;
	const changes = state.changes[tbl];
	if (!rawData) return [];
	const data = [
		...rawData.map(r => [...r]),
		...created.map(id => [id, ...columns.slice(1).map(c => null)])
	].filter(r => !deleted.includes(r[0] as number)) as typeof rawData;
	for (const { id, column, value } of changes) {
		const row = data.find(r => r[0] === id);
		const columnIdx = columns.findIndex(c => c.id === column.id);
		if (row) row[columnIdx] = value;
	}
	const sortIdx = columns.findIndex(c => c.type === 'time');
	if (sortIdx > 0)
		data.sort((a: any, b: any) => a[sortIdx] - b[sortIdx]);
	return data;
};

export const useTable = (tbl: TableName='feid') => ({
	data: useEventsState(st => st.data[tbl])!,
	columns: useEventsState(st => st.columns[tbl])!,
});

export const useFeidCursor = () => {
	const { data, columns } = useTable();
	const cursor = useEventsState(st => st.cursor);
	const plotId = useEventsState(st => st.plotId);

	const [timeIdx, durIdx] = ['time', 'duration'].map(c =>
		columns.findIndex(col => col.name === c));
	const targetId = cursor?.entity !== 'feid' ? plotId : cursor.id;
	const targetIdx = data.findIndex(r => r[0] === targetId);
	const duration = data[targetIdx]?.[durIdx] as number | undefined;
	const start = data[targetIdx]?.[timeIdx] as Date | undefined;
	const end = duration == null ? undefined : start &&
		new Date(start?.getTime() + duration * 36e5);
	return { duration, start, end, id: targetId }; 
};

export type RowDict = { [k: string] : Value | undefined };
export const rowAsDict = (row: any[], columns: ColumnDef[]): RowDict =>
	Object.fromEntries(columns.map((c, i) => [c.id, row?.[i] ?? null]));

export const useSources = () => {
	const cursor = useEventsState(st => st.cursor);
	const plotId = useEventsState(st => st.plotId);
	const targetId = cursor?.entity !== 'feid' ? plotId : cursor.id;
	const src = useTable('feid_sources');
	const erupt = useTable('sources_erupt');
	const ch = useTable('sources_ch');
	if (!src.data || !erupt.data || !ch.data)
		return [];
	return src.data.filter(row => row[fIdIdx] === targetId).map(row => {
		const source = rowAsDict(row, src.columns);
		if (row[chIdIdx]) {
			const found = ch.data.find(r => r[0] === row[chIdIdx]);
			return { source, ch: found && rowAsDict(found, ch.columns) };
		} else if (row[eruptIdIdx]) {
			const found = erupt.data.find(r => r[0] === row[eruptIdIdx]);
			return { source, erupt: found && rowAsDict(found, erupt.columns) };
		}
		return { source };
	}).filter(a => !!a); 
};

export const useSource = (tbl: 'sources_ch' | 'sources_erupt') => {
	const cursor = useEventsState(st => st.cursor);
	const modifySource = useEventsState(st => st.modifySource);
	const src = useTable('feid_sources');
	const { data, columns } = useTable(tbl);
	const idIdx = 'sources_erupt' === tbl ? eruptIdIdx : chIdIdx;
	const targetId = modifySource ? src.data.find(row => row[0] === modifySource)?.[idIdx] as number :
		cursor?.entity === tbl ? cursor.id! : null;
	return targetId == null ? null : rowAsDict(data.find(row => row[0] === targetId)!, columns);
};

export const setRawData = (tbl: TableName, rdata: DataRow[], cols: ColumnDef[]) => queueMicrotask(() =>
	useEventsState.setState(state => {
		state.columns[tbl] = cols;
		state.rawData[tbl] = rdata;
		state.data[tbl] = applyChanges(state, tbl);
	
	}));

export const discardChange = (tbl: TableName, { column, id }: ChangeValue) =>
	useEventsState.setState(state => {
		state.changes[tbl] = state.changes[tbl].filter(c => c.id !== id || column.id !== c.column.id);
		state.data[tbl] = applyChanges(state, tbl);
	});

export const resetChanges = (keepData: boolean) =>
	useEventsState.setState(state => {
		for (const tbl of tables) {
			state.changes[tbl] = [];
			state.created[tbl] = [];
			state.deleted[tbl] = [];
			if (!keepData)
				state.data[tbl] = applyChanges(state, tbl);
		}
	});

export function deleteEvent(tbl: TableName, id: number) {
	useEventsState.setState(st => {
		st.deleted[tbl] = [...st.deleted[tbl], id];
		if (['sources_ch', 'sources_erupt'].includes(tbl)) {
			const idIdx = 'sources_erupt' === tbl ? eruptIdIdx : chIdIdx;
			st.data.feid_sources?.filter(r => r[idIdx] === id).forEach(sRow => {
				st.deleted.feid_sources = [...st.deleted.feid_sources, sRow[0]];
			});

		}
		st.data[tbl] = applyChanges(st, tbl);
	});
}

export function makeChange(tbl: TableName, { column, value, id }: ChangeValue) {
	const { rawData, columns } = useEventsState.getState();
	const row = rawData[tbl]!.find(r => r[0] === id);
	const colIdx = columns[tbl]!.findIndex(c => c.id === column.id);

	useEventsState.setState(st => {
		st.changes[tbl] = [
			...st.changes[tbl].filter(c => c.id !== id || column.id !== c.column.id ),
			...(!equalValues(row?.[colIdx] ?? null, value) ? [{ id, column, value }] : [])];
		st.data[tbl] = applyChanges(st, tbl);
	});
	return true;
};

export function makeSourceChanges(tbl: 'sources_ch' | 'sources_erupt', row: RowDict, feid_id?: number, createdSrc?: number) {
	useEventsState.setState(state => {
		const id = row.id as number;
		const { changes, created, columns, rawData, data } = state;
		if (createdSrc && !created.feid_sources.includes(createdSrc))
			created.feid_sources = [createdSrc, ...created.feid_sources];
		if (createdSrc && !created[tbl].includes(id))
			created[tbl] = [id, ...created[tbl]];
		if (createdSrc) {
			state.modifySource = createdSrc;
			const sLinkIdx = tbl === 'sources_ch' ? 2 : 3;
			changes.feid_sources = [...changes.feid_sources,
				{ id: createdSrc, column: columns.feid_sources![1], value: feid_id!, silent: true },
				{ id: createdSrc, column: columns.feid_sources![sLinkIdx], value: id, silent: true }
			];
		}
		const rawRow = rowAsDict(createdSrc ? [id] : rawData[tbl]!.find(r => r[0] === id)!, columns[tbl]!);

		for (const [colId, value] of Object.entries(row)) {
			const column = columns[tbl]!.find(c => c.id === colId)!;
			const silent = !linkIds.includes(colId) && !colId.endsWith('source');
			changes[tbl] = [
				...changes[tbl].filter(chg => chg.id !== id || colId !== chg.column.id ),
				...(!equalValues(rawRow[colId], value) ? [{ id, column, value: value ?? null, silent }] : [])];

		}
		for (const tb of [tbl, 'feid_sources'] as TableName[])
			data[tb] = applyChanges(state, tb);
	});

};