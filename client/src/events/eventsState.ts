import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { equalValues, type ChangeValue } from './events';
import type { ColumnDef, DataRow } from './columns';

export type Sort = { column: string, direction: 1 | -1 };
export type Cursor = { row: number, column: number, entity: string, editing?: boolean, id?: number };
const tables = ['feid', 'feid_sources', 'sources_erupt'] as const;
export type TableName = typeof tables[number];

const defaultSate = {
	cursor: null as Cursor | null,
	sort: { column: 'time', direction: 1 } as Sort,
	plotId: null as number | null,
	modifyId: null as number | null,
	setStartAt: null as Date | null,
	setEndAt: null as Date | null,

	changes: Object.fromEntries(tables.map(t => [t, [] as ChangeValue[]])) as { [t in TableName]: ChangeValue[] },
	columns: {} as { [t in TableName]: ColumnDef[] },
	rawData: {} as { [t in TableName]: DataRow[] },
	data:    {} as { [t in TableName]: DataRow[] },
};

type EventsState = typeof defaultSate & {
	setEditing: (val: boolean) => void,
	setModify: (val: number | null) => void,
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
			setEditing: (val) => set(st => { if (st.cursor) st.cursor.editing = val; }),
			setModify: (val) => set(st => { st.modifyId = val; }),
			setStart:  (val) => set(st => { st.setStartAt = val; st.setEndAt = null; }),
			setEnd:    (val) => set(st => { st.setEndAt = val; }),
			setCursor: (cursor) => set(st => ({ ...st, cursor })),
			toggleSort: (column, dir) => set(st => ({ ...st, sort: { column,
				direction: dir ?? (st.sort.column === column ? -1 * st.sort.direction : 1) } })),
			setPlotId: (setter) => set(st => ({ ...st, plotId: setter(st.plotId) })),
			escapeCursor: () => set(st => { st.cursor = st.cursor?.editing ? { ...st.cursor, editing: false } : null; })
		})
	)
);

const applyChanges = (rawData: DataRow[], columns: ColumnDef[], changes: ChangeValue[]) => {
	const data = [...rawData.map(r => [...r])] as typeof rawData;
	for (const { id, column, value } of changes) {
		const row = data.find(r => r[0] === id);
		const columnIdx = columns.findIndex(c => c.id === column.id);
		if (row) row[columnIdx] = value;
	}
	const sortIdx = columns.findIndex(c => c.name === 'time');
	if (sortIdx > 0)
		data.sort((a: any, b: any) => a[sortIdx] - b[sortIdx]);
	return data;
};

export const useTable = (tbl: TableName='feid') => ({
	data: useEventsState(st => st.data[tbl]),
	columns: useEventsState(st => st.columns[tbl]),
});

export const useCursorTime = () => {
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
	return { duration, start, end }; 
};

export const setRawData = (tbl: TableName, rdata: DataRow[], cols: ColumnDef[]) => queueMicrotask(() =>
	useEventsState.setState(state => {
		state.columns[tbl] = cols;
		state.rawData[tbl] = rdata;
		state.data[tbl] = applyChanges(rdata, cols, state.changes[tbl]);
	
	}));

export const discardChange = (tbl: TableName, { column, id }: ChangeValue) =>
	useEventsState.setState(({ changes, rawData, data, columns }) => {
		changes[tbl] = changes[tbl].filter(c => c.id !== id || column.id !== c.column.id);
		data[tbl] = applyChanges(rawData[tbl], columns[tbl], []);
	});

export const resetChanges = (keepData?: boolean) =>
	useEventsState.setState(({ changes, rawData, data, columns }) => {
		for (const tbl of tables) {
			changes[tbl] = [];
			if (!keepData)
				data[tbl] = applyChanges(rawData[tbl], columns[tbl], []);
		}
	});

export const makeChange = (tbl: TableName, { column, value, id }: ChangeValue) => {
	const { rawData, columns } = useEventsState.getState();
	const row = rawData[tbl].find(r => r[0] === id);
	const colIdx = columns[tbl].findIndex(c => c.id === column.id);
	if (!row) return false;

	useEventsState.setState(({ changes, data }) => {
		changes[tbl] = [
			...changes[tbl].filter(c => c.id !== id || column.id !== c.column.id ),
			...(!equalValues(row[colIdx], value) ? [{ id, column, value }] : [])];
		data[tbl] = applyChanges(rawData[tbl], columns[tbl], changes[tbl]);
	});
	return true;
};