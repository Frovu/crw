import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useLayoutsStore, setNodeParams, type Panel } from '../../layout';
import { getApp } from '../../app';
import type { Value } from '../columns/columns';
import type { Column } from '../../api';

const defaultSettings = {
	showChangelog: false,
	showAverages: true,
	showIncludeMarkers: true,
	showMagneticClouds: true,
	plotOffset: [-24, 48],
	plotOffsetSolar: [-12, 12],
	plotUnlistedEvents: true,
	showEventsEnds: false,
	showGrid: true,
	showMarkers: true,
	showLegend: false,
	showTitle: true,
	shownColumns: undefined as undefined | string[],
	columnOrder: undefined as undefined | string[],
};
export type EventsSettings = typeof defaultSettings & {
	set: <T extends keyof EventsSettings>(key: T, val: EventsSettings[T]) => void;
	setColumns: (fn: (cols: string[]) => string[]) => void;
	setColumnOrder: (order: string[]) => void;
	reset: () => void;
};

export const useEventsSettings = create<EventsSettings>()(
	persist(
		(set) => ({
			...defaultSettings,
			set: (key, val) => set((state) => ({ ...state, [key]: val })),
			setColumns: (fn) => set((state) => ({ ...state, shownColumns: fn(state.shownColumns!) })),
			setColumnOrder: (val) => set((state) => ({ ...state, columnOrder: val })),
			reset: () => set(defaultSettings),
		}),
		{
			name: 'eventsAppSettings',
		}
	)
);

export type EventsPanel<T> = Panel<T> & {
	isPlot?: boolean;
	isStat?: boolean;
	isSolar?: boolean;
};

export type TableParams = {
	showChangelog: boolean;
	showAverages: boolean;
	hideHeader?: boolean;
	showIncludeMarkers?: boolean;
};

export type TableMenuDetails = {
	header?: Column;
	averages?: { averages: (number[] | null)[]; label: string; row: number; column: number };
	cell?: { id: number; column: Column; value: Value };
};

export function copyAverages({ averages, row, column }: Required<TableMenuDetails>['averages'], what: 'all' | 'row' | 'col') {
	if (what === 'col') return navigator.clipboard.writeText(averages[column]?.map((c) => c.toFixed(2)).join(',') ?? '');
	const filtered = averages.filter((r) => r);
	const rows = filtered[0]!.map((_, ri) => filtered.map((col) => col![ri].toFixed(2)).join(','));
	const text = what === 'all' ? rows.join('\r\n') : rows[row];
	navigator.clipboard.writeText(text);
}

export function equalValues(a?: any, b?: any) {
	return a instanceof Date ? (a as Date).getTime() === (b as Date | null)?.getTime() : a === b;
}

export function parseColumnValue(val: string, column: Column) {
	switch (column.dtype) {
		case 'time':
			return new Date(val.includes(' ') ? val.replace(' ', 'T') + 'Z' : val);
		case 'real':
			return parseFloat(val);
		case 'integer':
			return parseInt(val);
		default:
			return val;
	}
}

export function valueToString(v: Value) {
	if (v instanceof Date)
		return v
			.toISOString()
			.replace(/:\d\d\..+/, '')
			.replace('T', ' ');
	if (typeof v !== 'number') return v?.toString() ?? '';
	if (v !== 0 && (Math.abs(v) < 0.001 || Math.abs(v) > 99999)) return v.toExponential(0);
	return parseFloat(v.toFixed(Math.max(0, 3 - v.toFixed(0).length))).toString();
}

export function isValidColumnValue(val: Value, column: Column) {
	if (val == null) return column.type !== 'static' || !column.not_null;

	switch (column.dtype) {
		case 'time':
			return val instanceof Date && !isNaN(val.getTime());
		case 'real':
		case 'integer':
			return typeof val == 'number' && !isNaN(val);
		case 'enum':
			return column.type === 'static' && column.enum?.includes(val as string);
		default:
			return val !== '';
	}
}

export const setStatColumn = (col: Column, i: number) => {
	const { list, active } = useLayoutsStore.getState().apps[getApp()];
	const layout = list[active];
	const key = (['column0', 'column1'] as const)[i];
	for (const [id, iitem] of Object.entries(layout.items)) {
		if (typeof (iitem as any)?.[key] !== 'undefined') {
			const item = iitem as any;
			setNodeParams<any>(id, { [key]: item.type === 'Histogram' && item[key] === col.name ? null : col.name });
		}
	}
};
