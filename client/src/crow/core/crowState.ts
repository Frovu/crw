import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type CrowCursor = { time: number; locked: boolean };

const defaultSate = {
	cursor: null as CrowCursor | null,
	realtimeHour: Math.ceil(new Date().getTime() / 36e5) * 3600,
};

export type CrowState = typeof defaultSate & {
	setCursor: (cursor: CrowState['cursor']) => void;
	escapeCursor: () => void;
};

export const useCrowState = create<CrowState>()(
	immer((set) => ({
		...defaultSate,
		setCursor: (cursor) =>
			set((st) => {
				st.cursor = cursor;
			}),
		escapeCursor: () =>
			set((st) => {
				st.cursor = null;
			}),
	})),
);
