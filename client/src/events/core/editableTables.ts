import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { equalValues } from './eventsSettings';
import { sourceLinks, type ChangelogResponse, type Column, type StaticColumn, type Tables } from '../../api.d';
import { useTableDataQuery } from './query';
import { useEventsState } from './eventsState';
import { useMemo } from 'react';

export type TableValue = string | number | Date | null;
export type TableRow = [number, ...TableValue[]];

export const editableTables = ['feid', 'feid_sources', 'sources_erupt', 'sources_ch'] as const;
export type EditableTable = keyof Tables & (typeof editableTables)[number];

type TableState<T extends EditableTable> = {
	changes: ChangeValue[];
	created: TableRow[];
	deleted: number[];
	columns: (T extends 'feid' ? Column : StaticColumn)[];
	index: { [c in keyof Tables[T]]: number };
	rawData: TableRow[];
	data: TableRow[];
	changelog: null | ChangelogResponse;
};
type TablesState = { [t in EditableTable]: TableState<t> };

export type ChangeValue = { id: number; column: string; value: TableValue; silent?: boolean; fast?: boolean };

const defaultSate = Object.fromEntries(
	editableTables.map((t) => [
		t,
		{
			changes: [] as any,
			created: [] as any,
			deleted: [] as any,
			columns: [] as any,
			rawData: [] as any,
			data: [] as any,
			index: {} as any,
			changelog: null,
		},
	])
) as TablesState;

export const useTablesStore = create<TablesState>()(
	immer((set) => ({
		...defaultSate,
	}))
);

export const setRawData = (tbl: EditableTable, rdata: TableRow[], columns: Column[], changelog: null | ChangelogResponse) =>
	queueMicrotask(() =>
		useTablesStore.setState((state) => {
			state[tbl].changelog = changelog;
			state[tbl].columns = columns;
			state[tbl].index = Object.fromEntries(columns.map((col, i) => [col.sql_name, i])) as any;
			state[tbl].rawData = rdata;
			state[tbl].data = renderTableData(state, tbl);
		})
	);

const renderTableData = (state: TablesState, tbl: EditableTable) => {
	const { columns, rawData, deleted, created, changes } = state[tbl];

	const data = [...rawData.map((r) => [...r]), ...created.map((r) => [...r])].filter(
		(r) => !deleted.includes(r[0] as number)
	) as typeof rawData;

	for (const { id, column, value } of changes) {
		const row = data.find((r) => r[0] === id);
		const columnIdx = columns.findIndex((col) => col.sql_name === column);
		if (row) row[columnIdx] = value;
	}

	if (tbl === 'sources_erupt') {
		const [i1, i2, i3] = (['flr_start', 'cme_time', 'rc_icme_time'] as const).map((name) => state[tbl].index[name]);
		data.sort((a: any, b: any) => (a[i1] ?? a[i2] ?? a[i3]) - (b[i1] ?? b[i2] ?? b[i3]));
	} else if (tbl !== 'feid_sources') {
		const idx = state[tbl].index.time;
		data.sort((a: any, b: any) => a[idx] - b[idx]);
	}

	return data;
};

export const tableRowAsDict = <T extends keyof Tables = never>(row: TableValue[], columns: Column[]) =>
	Object.fromEntries(columns.map((c, i) => [c.sql_name, row?.[i] ?? null])) as Tables[T];

const tableApi = <T extends EditableTable>({ columns, data, index }: Pick<TableState<T>, 'columns' | 'data' | 'index'>) => ({
	columns,
	data,
	index,
	entry: (row: (typeof data)[number]) => tableRowAsDict<T>(row, columns),
	getById: (id: number | null) => {
		if (id === null) return null;
		const row = data.find((r) => r[0] === id);
		return row ? tableRowAsDict<T>(row, columns) : null;
	},
});

export const getTable = <T extends EditableTable>(tbl: T) => tableApi(useTablesStore.getState()[tbl]);

export const useTable = <T extends EditableTable>(tbl: T) => {
	const query = useTableDataQuery(tbl);
	const columns = useTablesStore((st) => st[tbl].columns);
	const data = useTablesStore((st) => st[tbl].data);
	const index = useTablesStore((st) => st[tbl].index);

	if (!data && query.isFetched) query.refetch();
	return useMemo(() => tableApi({ columns, data, index }), [columns, data, index]);
};

export const discardChange = (tbl: EditableTable, { column, id }: ChangeValue) =>
	useTablesStore.setState((state) => {
		state[tbl].changes = state[tbl].changes.filter((c) => c.id !== id || column !== c.column);
		state[tbl].data = renderTableData(state, tbl);
	});

export const discardCreated = (tbl: EditableTable, id: number) =>
	useTablesStore.setState((state) => {
		state[tbl].created = state[tbl].created.filter((r) => r[0] !== id);
		state[tbl].data = renderTableData(state, tbl);
	});

export const discardDeleted = (tbl: EditableTable, id: number) =>
	useTablesStore.setState((state) => {
		state[tbl].deleted = state[tbl].deleted.filter((did) => did !== id);
		state[tbl].data = renderTableData(state, tbl);
	});

export const resetChanges = (keepData: boolean) =>
	useTablesStore.setState((state) => {
		for (const tbl of editableTables) {
			state[tbl].changes = [];
			state[tbl].created = [];
			state[tbl].deleted = [];
			if (!keepData) state[tbl].data = renderTableData(state, tbl);
		}
	});

export function deleteEvent(tbl: EditableTable, id: number) {
	useTablesStore.setState((st) => {
		st[tbl].deleted = [...st[tbl].deleted, id];
		if (tbl === 'sources_ch' || tbl === 'sources_erupt') {
			const idIdx = st.feid_sources.index['sources_erupt' === tbl ? 'erupt_id' : 'ch_id'];
			st.feid_sources.data
				?.filter((r) => r[idIdx] === id)
				.forEach((sRow) => {
					st.feid_sources.deleted = [...st.feid_sources.deleted, sRow[0]];
				});
		}
		st[tbl].data = st[tbl].data?.filter((r) => r[0] !== id);
	});
}

export function makeChange(tbl: EditableTable, chgs: ChangeValue | ChangeValue[]) {
	const changes = Array.isArray(chgs) ? (chgs as ChangeValue[]) : [chgs];

	useTablesStore.setState((st) => {
		for (const [i, { id, value, column, fast, silent }] of changes.entries()) {
			const rawRow = st[tbl].rawData.find((r) => r[0] === id);
			const colIdx = st[tbl].columns.findIndex((c) => c.sql_name === column);

			// TODO: handle deleting created entries

			st[tbl].changes = [
				...st[tbl].changes.filter((change) => change.id !== id || column !== change.column),
				...(!equalValues(rawRow?.[colIdx] ?? null, value) ? [{ id, column, value, silent }] : []),
			];

			if (fast || i < changes.length - 1) {
				const row = st[tbl].data!.find((r) => r[0] === id);
				if (row) row[colIdx] = value;
			} else {
				console.log('rendering', tbl);
				st[tbl].data = renderTableData(st, tbl);
			}
		}
	});
}

export function createFeid(row: { time: Date; duration: number }) {
	const id = Date.now() % 1e6;
	useTablesStore.setState((state) => {
		const { columns, created } = state.feid;
		const newRow = [id, ...columns.slice(1).map((col) => row[col.sql_name as keyof typeof row] ?? null)];
		state.feid.created = [newRow as any, ...created];
		state.feid.data = renderTableData(state, 'feid');
	});
	return id;
}

export function linkSource(tbl: 'sources_ch' | 'sources_erupt', feidId: number, sourceId?: number) {
	const feidSrcId = (Date.now() % 1e6) + 1e6;
	const id = sourceId ?? Date.now() % 1e6;
	useTablesStore.setState((state) => {
		const { columns, data, created } = state[tbl];

		if (sourceId == null) {
			const newRow = [id, ...columns.slice(1).map(() => null)] as TableRow;
			state[tbl].created = [...created, newRow];
			state[tbl].data = [...data, newRow];
		}

		const targetIdCol = tbl === 'sources_ch' ? 'ch_id' : 'erupt_id';
		const feidSrcRow = [
			feidSrcId,
			...state.feid_sources.columns.slice(1).map((c) => ({ [targetIdCol]: id, feid_id: feidId }[c.sql_name] ?? null)),
		] as TableRow;
		state.feid_sources.created = [...state.feid_sources.created, feidSrcRow];
		state.feid_sources.data = [...state.feid_sources.data, feidSrcRow];

		useEventsState.setState((estate) => {
			estate.modifySourceId = feidSrcId;
		});
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
				silent:
					!Object.values(sourceLinks)
						.map((l) => l[0])
						.includes(column as any) && !column.endsWith('source'),
			}))
	);
}
