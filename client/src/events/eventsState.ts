import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type Sort = { column: string, direction: 1 | -1 };
export type Cursor = { row: number, column: number, entity: string, editing?: boolean };

const defaultViewSate = {
	cursor: null as Cursor | null,
	sort: { column: 'time', direction: 1 } as Sort,
	plotId: null as number | null,
	modifyId: null as number | null,
	setStartAt: null as Date | null,
	setEndAt: null as Date | null,
};

type EventsState = typeof defaultViewSate & {
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
			...defaultViewSate,
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
