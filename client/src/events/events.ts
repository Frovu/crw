import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createContext, useContext, useMemo } from 'react';
import type { Filter, Sample } from './sample';
import { useLayoutsStore, setNodeParams, type Panel, LayoutContext } from '../layout';
import { getApp } from '../app';
import type { ColumnDef, Value, DataRow } from './columns';
import type { BasicPlotParams } from '../plots/basicPlot';

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

export type Onset = { time: Date; type: string | null; secondary?: boolean; insert?: boolean };
export type MagneticCloud = { start: Date; end: Date };

export type FeidRow = {
	id: number;
	time: Date;
	duration: number;
	onset_type: number | null;
	s_type: number | null;
	s_description: string | null;
	s_confidence: string | null;
	mc_time: Date | null;
	cme_time: Date | null;
	flr_time: Date | null;
	comment: string | null;
};

export type FeidSrcRow =
	| {
			id: number;
			feid_id: number;
			erupt_id: number;
			cr_influence: string | null;
	  }
	| {
			id: number;
			feid_id: number;
			ch_id: number;
			cr_influence: string | null;
	  };

export type SrcEruptRow = {
	id: number;
	flr_start: Date | null;
	flr_peak: Date | null;
	flr_end: Date | null;
	flr_flux: number | null;
	flr_source: string | null;
	active_region: number | null;
	lat: number | null;
	lon: number | null;
	coords_source: string | null;
	cme_time: Date | null;
	cme_speed: number | null;
	cme_source: string | null;
	note: string | null;

	solarsoft_flr_start: Date | null;
	noaa_flr_start: Date | null;
	donki_flr_id: number | null;
	solardemon_flr_id: number | null;
	donki_cme_id: number | null;
	lasco_cme_time: Date | null;
	cactus_cme_time: Date | null;
	rc_icme_time: Date | null;
};

export type SrcCHRow = {
	id: number;
	tag: string | null;
	chimera_time: Date | null;
	chimera_id: number | null;
	time: Date | null;
	lat: number | null;
	area: number | null;
	b: number | null;
	phi: number | null;
	width: number | null;
};

export type Flare = {
	src: string;
	class: string | null;
	lat: number;
	lon: number;
	start_time: Date;
	peak_time: Date;
	end_time: Date;
	active_region: number | null;
	id: number | null;
	flux: number | null;
	linked_events: null | string[];
};

export type CME = {
	src: string;
	time: Date;
	lat: number | null;
	lon: number | null;
	speed: number | null;
	id: number | null;
	linked_events: null | string[];
};

export type ICME = {
	src: string;
	time: Date;
	cmes_time: null | string[];
};

export type ChangeLogEntry = {
	time: number;
	author: string;
	old: string;
	new: string;
	special: 'import' | null;
}[];

export type ChangeLog = {
	fields: string[];
	events: {
		[id: string]: {
			[col: string]: (number | null | string)[][];
		};
	};
};

export const getChangelogEntry = (chl: ChangeLog | undefined, eid: number, cid: string) =>
	chl?.events[eid]?.[cid]?.map((row) => Object.fromEntries(chl.fields.map((f, i) => [f, row[i]]))) as ChangeLogEntry | undefined;

export type ChangeValue = { id: number; column: string; value: Value; silent?: boolean; fast?: boolean };
export type FiltersCollection = { filter: Filter; id: number }[];

export const MainTableContext = createContext<{
	columns: ColumnDef[];
	columnIndex: { [col: string]: number };
	structure: { [tbl: string]: ColumnDef[] };
	rels: { [s: string]: string };
	series: { [s: string]: string };
	changelog?: ChangeLog;
}>({} as any);

export const SampleContext = createContext<{ data: DataRow[]; current: Sample | null; samples: Sample[] }>({} as any);

export const TableViewContext = createContext<{
	data: DataRow[];
	columns: ColumnDef[];
	markers: null | string[];
	includeMarkers: null | string[];
}>({} as any);

export const PlotContext = createContext<{ interval: [Date, Date]; base?: Date; onsets?: Onset[]; clouds?: MagneticCloud[] }>({} as any);

export type TableMenuDetails = {
	header?: ColumnDef;
	averages?: { averages: (number[] | null)[]; label: string; row: number; column: number };
	cell?: { id: number; column: ColumnDef; value: Value };
};

export const usePlotParams = <T>() => {
	const { params } = useContext(LayoutContext)!;
	const settings = useEventsSettings();
	const plotContext = useContext(PlotContext);

	return useMemo(() => {
		return {
			...settings,
			...plotContext!,
			...params,
			...(!settings.showMagneticClouds && { clouds: [] }),
			stretch: true,
		};
	}, [plotContext, settings, params]) as any as BasicPlotParams & T;
};

export function copyAverages({ averages, row, column }: Required<TableMenuDetails>['averages'], what: 'all' | 'row' | 'col') {
	if (what === 'col') return navigator.clipboard.writeText(averages[column]?.map((c) => c.toFixed(2)).join(',') ?? '');
	const filtered = averages.filter((r) => r);
	const rows = filtered[0]!.map((_, ri) => filtered.map((col) => col![ri].toFixed(2)).join(','));
	const text = what === 'all' ? rows.join('\r\n') : rows[row];
	navigator.clipboard.writeText(text);
}

export const findColumn = (columns: ColumnDef[], name: string) => columns.find((c) => c.fullName === name) ?? null;

export function equalValues(a?: any, b?: any) {
	return a instanceof Date ? (a as Date).getTime() === (b as Date | null)?.getTime() : a === b;
}

export function parseColumnValue(val: string, column: ColumnDef) {
	switch (column.type) {
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

export function isValidColumnValue(val: Value, column: ColumnDef) {
	if (val == null) return column.nullable;
	switch (column.type) {
		case 'time':
			return val instanceof Date && !isNaN(val.getTime());
		case 'real':
		case 'integer':
			return typeof val == 'number' && !isNaN(val);
		case 'enum':
			return column.enum?.includes(val as string);
		default:
			return val !== '';
	}
}

export const setStatColumn = (col: ColumnDef, i: number) => {
	const { list, active } = useLayoutsStore.getState().apps[getApp()];
	const layout = list[active];
	const key = (['column0', 'column1'] as const)[i];
	for (const [id, iitem] of Object.entries(layout.items)) {
		if (typeof (iitem as any)?.[key] !== 'undefined') {
			const item = iitem as any;
			setNodeParams<any>(id, { [key]: item.type === 'Histogram' && item[key] === col.id ? null : col.id });
		}
	}
};
