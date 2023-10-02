import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Filter } from './Sample';

type EventsSettings = {
	showColumns: string[],
	showChangelog: boolean,
	showAverages: boolean,
	set: <T extends keyof EventsSettings>(key: T, val: EventsSettings[T]) => void,
};

export const useEventsSettings = create<EventsSettings>()(
	persist(set => ({
		showColumns: ['time', 'magnitude'],
		showChangelog: false,
		showAverages: true,
		set: (key, val) => set(state => ({ ...state, [key]: val }))
	}), {
		name: 'eventsAppSettings'
	})
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


