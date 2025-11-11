import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Tables } from '../../api';
import { getTable, useTable } from './editableTables';
import { useMemo } from 'react';

export type Sort = { column: string; direction: 1 | -1 };

export type Cursor = { row: number; column: number; entity: string; editing?: boolean; id: number };

const defaultSate = {
	cursor: null as Cursor | null,
	sort: { column: 'time', direction: 1 } as Sort,
	plotId: null as number | null,
	modifyId: null as number | null,
	modifySourceId: null as number | null,
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
				st.modifySourceId = val;
			}),
		setEditing: (val) =>
			set((st) => {
				if (st.cursor) st.cursor.editing = val;
			}),
		setModify: (val) =>
			set((st) => {
				st.modifyId = val;
				st.modifySourceId = null;
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
				if (cursor?.entity === 'feid' && cursor.id !== (st.cursor?.id ?? st.plotId)) st.modifySourceId = null;
				if (['sources_erupt', 'sources_ch'].includes(cursor?.entity as any)) {
					const sources = getTable('feid_sources');
					const target = cursor?.entity === 'sources_ch' ? 'ch_id' : 'erupt_id';
					const idIdx = sources.index[target];
					const src = sources.data.find((row) => row[idIdx] === cursor?.id);
					if (src) {
						st.modifySourceId = src[sources.index.id] as number;
						st.plotId = src[sources.index.feid_id] as number;
					}
				}
				st.cursor = cursor;
			}),
		setPlotId: (setter) =>
			set((st) => {
				st.plotId = setter(st.plotId);
				st.modifySourceId = null;
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
	const { data, getById, entry } = useTable('feid');
	const plotId = useEventsState((st) => st.plotId);

	return useMemo(() => {
		const row = getById(plotId) ?? entry(data[data.length - 1]);
		const duration = row.duration;
		const start = row.time;
		const end = new Date(start.getTime() + duration * 36e5);
		return { duration, start, end, id: plotId, row };
	}, [data, entry, getById, plotId]);
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
				const source = src.entry(row);
				if (source.ch_id !== null) {
					return { source, ch: ch.getById(source.ch_id) };
				} else if (source.erupt_id !== null) {
					return { source, erupt: erupt.getById(source.erupt_id) };
				}
				return { source };
			});
	}, [ch, erupt, plotId, src]);
};

export const useSelectedSource = <T extends 'sources_ch' | 'sources_erupt'>(tbl: T, soft = false): Tables[T] | null => {
	const sources = useCurrentFeidSources();
	const modifySourceId = useEventsState((st) => st.modifySourceId);
	const what = tbl === 'sources_ch' ? 'ch' : 'erupt';
	if (modifySourceId) return (sources.find((src) => src.source.id === modifySourceId)?.[what] as Tables[T]) ?? null;
	if (!soft) return null;

	const found = sources.find((src) => src[what] && src.source.cr_influence === 'primary')?.[what] ?? sources.find((src) => src[what]);
	return (found as Tables[T]) ?? null;
};
