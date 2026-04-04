import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

const HOUR = 3600;
export const crowWindowModes = ['year', 'month', '10 days'] as const;
export type CrowWindowMode = (typeof crowWindowModes)[number];

const defaultSettings = {
	windowStart: new Date('2024-05-01').getTime() / 1e3,
	windowMode: 'month' as CrowWindowMode,
};

export type CrowSettings = typeof defaultSettings & {
	set: <T extends keyof CrowSettings>(key: T, val: CrowSettings[T]) => void;
	reset: () => void;
};

export const useCrowSettings = create<CrowSettings>()(
	persist(
		immer((set) => ({
			...defaultSettings,
			set: (key, val) =>
				set((state) => {
					state[key] = val;
				}),
			reset: () => set(defaultSettings),
		})),
		{
			name: 'crowSettings',
		},
	),
);

function windowEnd(start: number, mode: CrowWindowMode) {
	const date = new Date(start * 1e3);
	const year = date.getUTCFullYear();
	if (mode === 'year') return Date.UTC(year + 1) / 1e3;
	if (mode === 'month') return Date.UTC(year, date.getUTCMonth() + 1) / 1e3;
	if (mode === '10 days') {
		const day = date.getUTCDate();
		if (day > 20) return Date.UTC(year, date.getUTCMonth() + 1) / 1e3;
		return Date.UTC(year, date.getUTCMonth(), day + 10) / 1e3;
	}
	return mode;
}

export const useCrowWindow = () => {
	const { windowStart, windowMode } = useCrowSettings();

	const margin = HOUR * 24;
	const end = windowEnd(windowStart, windowMode);
	return { plotStart: windowStart - margin, plotEnd: end + margin, start: windowStart, end };
};
