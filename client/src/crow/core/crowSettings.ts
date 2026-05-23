import debounce from 'lodash.debounce';
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { clamp } from '../../util';
import { useCrowState } from './crowState';

const HOUR = 3600;
export const crowWindowModes = ['year', 'month', '10 days'] as const;
export type CrowWindowMode = (typeof crowWindowModes)[number];

export const MIN_CROW_YEAR = 1957;
export const maxCrowYear = () => new Date().getUTCFullYear();
const clampStart = (val: number) =>
	clamp(Date.UTC(MIN_CROW_YEAR) / 1e3, Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth()) / 1e3, val);

const defaultSettings = {
	realtimeWindow: 24 * 5,
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

export const setCrowYear = (val: number, forceYearMode = false) =>
	useCrowSettings.setState((state) => {
		const curMonth = new Date(state.windowStart * 1e3).getUTCMonth();
		if (forceYearMode || state.windowMode === 'year') {
			state.windowMode = 'year';
			state.windowStart = clampStart(Date.UTC(val, 0, 1) / 1e3);
		} else {
			state.windowMode = 'month';
			state.windowStart = clampStart(Date.UTC(val, curMonth, 1) / 1e3);
		}
	});

export const setCrowMonth = (val: number) =>
	useCrowSettings.setState((state) => {
		const curYear = new Date(state.windowStart * 1e3).getUTCFullYear();
		state.windowMode = 'month';
		state.windowStart = clampStart(Date.UTC(curYear, val, 1) / 1e3);
	});

export const setCrow10days = (val: number) =>
	useCrowSettings.setState((state) => {
		const date = new Date(state.windowStart * 1e3);
		const curMonth = date.getUTCMonth();
		const curYear = date.getUTCFullYear();
		state.windowMode = '10 days';
		state.windowStart = clampStart(Date.UTC(curYear, curMonth ?? 0, val) / 1e3);
	});

export const cycleCrowWindow = (delta: number) => {
	const { windowMode, windowStart } = useCrowSettings.getState();
	const date = new Date(windowStart * 1e3);
	const curMonth = date.getUTCMonth();
	const curYear = date.getUTCFullYear();
	const curDay = date.getUTCDate();

	if (windowMode === 'year') return setCrowYear(curYear + delta);
	if (windowMode === 'month') return setCrowMonth(curMonth! + delta);
	if (windowMode === '10 days') {
		const days = [1, 11, 21];
		const idx = days.indexOf(curDay!);
		const newDay = days[(idx + delta + days.length) % days.length];
		const monthDelta = idx + delta < 0 ? -1 : idx + delta >= days.length ? 1 : 0;
		const newDate = Date.UTC(curYear, curMonth! + monthDelta, newDay) / 1e3;
		useCrowSettings.setState((state) => {
			state.windowStart = clampStart(newDate);
		});
	}
};

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

export const useRealtimeWindow = () => {
	const realtimeWindow = useCrowSettings((st) => st.realtimeWindow);
	const realtimeHour = useCrowState((st) => st.realtimeHour);

	const end = realtimeHour;
	const start = end - realtimeWindow * 3600;
	return useMemo(() => ({ start, end }), [start, end]);
};

export const useCrowWindowDebounced = (delay = 500) => {
	const [value, setValue] = useState(getCrowWindow());

	useEffect(() => {
		return useCrowSettings.subscribe(debounce(() => setValue(getCrowWindow()), delay, { leading: true }));
	}, [delay]);

	return value;
};
