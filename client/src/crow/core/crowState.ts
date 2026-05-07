import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type CrowCursor = { time: number; lock: boolean };

const defaultSate = {
	cursor: null as CrowCursor | null,
	realtimeHour: Math.ceil(new Date().getTime() / 36e5) * 3600,
};

export type CrowState = typeof defaultSate & {};

export const useCrowState = create<CrowState>()(
	immer(() => ({
		...defaultSate,
	})),
);

export const setCrowCursor = (setter: (curs: CrowCursor | null) => CrowCursor | null) =>
	useCrowState.setState((state) => {
		state.cursor = setter(state.cursor);
	});
