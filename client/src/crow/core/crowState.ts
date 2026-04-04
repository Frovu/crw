import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type CrowCursor = { time: number; sticky: boolean };

const defaultSate = {
	cursor: null as CrowCursor | null,
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
