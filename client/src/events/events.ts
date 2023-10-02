import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Filter, Sample, SampleState } from './Sample';
import { Layout } from './Layout';
import { SetStateAction, createContext } from 'react';

type EventsSettings = {
	showColumns: string[],
	showChangelog: boolean,
	showAverages: boolean,
	plotOffsetDays: number[],
	set: <T extends keyof EventsSettings>(key: T, val: EventsSettings[T]) => void,
	reset: () => void
};

const defaultSettings = {
	showColumns: ['fe_time', 'fe_onset_type', 'fe_magnitude', 'fe_v_max', 'fe_v_before',
		'fe_bz_min', 'fe_kp_max', 'fe_axy_max', 'ss_type', 'ss_description', 'ss_confidence'],
	showChangelog: false,
	showAverages: true,
	plotOffsetDays: [-1, 2],
};

export const useEventsSettings = create<EventsSettings>()(
	persist(
		set => ({
			...defaultSettings,
			set: (key, val) => set(state => ({ ...state, [key]: val })),
			reset: () => set(defaultSettings)
		}), {
			name: 'eventsAppSettings'
		}
	)
);

export type ColumnDef = {
	name: string,
	fullName: string,
	type: 'real' | 'integer' | 'text' | 'enum' | 'time',
	description?: string,
	enum?: string[],
	nullable: boolean,
	table: string,
	width: number,
	id: string,
	sqlName: string, // not unique across tables
	hidden?: boolean,
	isComputed: boolean,
	generic?: {
		id: number,
		entity: string,
		type: string,
		series: string,
		poi: string,
		shift: number
	},
	parseName: null | string,
	parseValue: null | { [key: string|number]: string|number|null }
};

export const statPlotOptions = [ 'Histogram', 'Correlation', 'Epoch collision' ] as const;
export const plotOptions = [ 'CR + Geomagn', 'SW + Plasma', 'Ring of Stations', 'SW', 'CR', ...statPlotOptions ] as const;
export const panelOptions = [ ...plotOptions, 'MainTable' ] as const;

export const isPanelDraggable = (panel: string) => plotOptions.includes(panel as any);
export const isPanelDuplicatable = (panel: string) => statPlotOptions.includes(panel as any);

export type PanelParams = {
	type?: typeof panelOptions[number],
};

export const defaultLayouts: { [name: string]: Layout } = {
	default: {
		tree: {
			root: {
				split: 'row',
				ratio: .4,
				children: ['left', 'right']
			},
			right: {
				split: 'column',
				ratio: .5,
				children: ['top', 'bottom']
			}
		},
		items: {
			left: {
				type: 'MainTable'
			},
			top: {
				type: 'SW + Plasma'
			},
			bottom: {
				type: 'CR + Geomagn'
			}
		}
	}
};

export type Onset = { time: Date, type: string | null, secondary?: boolean };
export type MagneticCloud = { start: Date, end: Date };
export type ChangeLog = {
	[id: string]: {
		[col: string]: [
			{
				time: number,
				author: string,
				old: string,
				new: string
			}
		]
	}
};

export type Value = Date | string | number | null;
export type ChangeValue = { id: number, column: ColumnDef, value: Value };
export type Sort = { column: string, direction: 1 | -1 };
export type Cursor = { row: number, column: number, editing?: boolean } | null;
export type FiltersCollection = { filter: Filter, id: number }[];

export const MainTableContext = createContext<{ data: Value[][], columns: ColumnDef[],
	firstTable: string, tables: string[], series: {[s: string]: string},
	changelog?: ChangeLog, changes: ChangeValue[], makeChange: (c: ChangeValue) => boolean }>({} as any);

export const SampleContext = createContext<{ data: Value[][], sample: SampleState, samples: Sample[], isEditing: boolean,
	setEditing: (a: boolean) => void, setSample: (d: SetStateAction<SampleState>) => void,
	filters: FiltersCollection, setFilters: (a: SetStateAction<FiltersCollection>) => void }>({} as any);

// export const useViewState = create()

