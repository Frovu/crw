import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Tables } from '../../api';
import { getTable, rowAsDict, useTable } from './editableTables';
import { useMemo } from 'react';

export type Sort = { column: string; direction: 1 | -1 };

export type Cursor = { row: number; column: number; entity: string; editing?: boolean; id: number };

const defaultSate = {
	cursor: null as Cursor | null,
	sort: { column: 'time', direction: 1 } as Sort,
	plotId: null as number | null,
	modifyId: null as number | null,
	modifySource: null as number | null,
	setStartAt: null as Date | null,
	setEndAt: null as Date | null,
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
					const sources = getTable('feid_sources');
					const target = cursor?.entity === 'sources_ch' ? 'ch_id' : 'erupt_id';
					const idIdx = sources.index[target];
					const src = sources.data.find((row) => row[idIdx] === cursor?.id);
					if (src) {
						st.modifySource = src[sources.index.id] as number;
						st.plotId = src[sources.index.feid_id] as number;
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
	const { data, columns } = useTable('feid');
	const plotId = useEventsState((st) => st.plotId);

	return useMemo(() => {
		const idx = data.findIndex((r) => r[0] === plotId);
		const row = rowAsDict<'feid'>(data[idx < 0 ? data.length - 1 : idx], columns);
		const duration = row.duration;
		const start = row.time;
		const end = new Date(start.getTime() + duration * 36e5);
		return { duration, start, end, id: plotId, row };
	}, [columns, data, plotId]);
};

export const useCurrentFeidSources = () => {
	const plotId = useEventsState((st) => st.plotId);
	const src = useTable('feid_sources');
	const erupt = useTable('sources_erupt');
	const ch = useTable('sources_ch');
	return useMemo(() => {
		return src.data
			.filter((row) => row[src.index.feid_id] === plotId)
			.map((row) => {
				const source = rowAsDict<'feid_sources'>(row, src.columns);
				if (source.ch_id) {
					const found = ch.data.find((r) => r[0] === source.ch_id);
					return { source, ch: found && rowAsDict<'sources_ch'>(found, ch.columns) };
				} else if (row[src.index.erupt_id]) {
					const found = erupt.data.find((r) => r[0] === source.erupt_id);
					return { source, erupt: found && rowAsDict<'sources_erupt'>(found, erupt.columns) };
				}
				return { source };
			});
	}, [ch.columns, ch.data, erupt.columns, erupt.data, plotId, src.columns, src.data, src.index]);
};

export const useSelectedSource = <T extends 'sources_ch' | 'sources_erupt'>(tbl: T, soft = false): Tables[T] | null => {
	const sources = useCurrentFeidSources();
	const modifySource = useEventsState((st) => st.modifySource);
	const what = tbl === 'sources_ch' ? 'ch' : 'erupt';
	if (modifySource) return (sources.find((src) => src.source.id === modifySource)?.[what] as Tables[T]) ?? null;
	if (!soft) return null;

	const found = sources.find((src) => src[what] && src.source.cr_influence === 'primary')?.[what] ?? sources.find((src) => src[what]);
	return (found as Tables[T]) ?? null;
};
