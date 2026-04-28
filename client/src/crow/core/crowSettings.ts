import debounce from 'lodash.debounce';
import { useEffect, useState } from 'react';
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

export const getCrowWindow = () => {
	const { windowStart: start, windowMode: mode } = useCrowSettings.getState();

	const date = new Date(start * 1e3);
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth();
	const day = date.getUTCDate();

	const monthStart = Date.UTC(year, month) / 1e3;
	const monthEnd = (mode === 'year' ? Date.UTC(year + 1) : Date.UTC(year, month + 1)) / 1e3;

	const end = mode !== '10 days' ? monthEnd : (day > 20 ? Date.UTC(year, month + 1) : Date.UTC(year, month, day + 10)) / 1e3;

	const marginBefore = HOUR * 24 * (mode === '10 days' ? 1 : 5);
	const marginAfter = HOUR * 24;

	return {
		start,
		end,
		plot: { start: start - marginBefore, end: end + marginAfter },
		fetch: { start: monthStart - HOUR * 24 * 14, end: monthEnd + marginAfter },
	};
};

export const useCrowWindowDebounced = (delay = 500) => {
	const [value, setValue] = useState(getCrowWindow());

	useEffect(() => {
		return useCrowSettings.subscribe(debounce(() => setValue(getCrowWindow()), delay, { leading: true }));
	}, [delay]);

	return value;
};
