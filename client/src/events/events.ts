import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createContext } from 'react';
import type { Filter, Sample } from './sample';
import type { CirclesParams } from '../plots/time/Circles';
import type { GSMParams } from '../plots/time/GSM';
import type { GeomagnParams } from '../plots/time/Geomagn';
import type { IMFParams } from '../plots/time/IMF';
import type { SWParams } from '../plots/time/SW';
import type { GenericColumn } from './columns';
import type { CorrelationParams } from '../plots/Correlate';
import type { HistogramParams } from '../plots/Histogram';
import type { CollisionOptions } from '../plots/EpochCollision';
import type { HistoryOptions } from '../plots/EventsHistory';
import { useLayoutsStore, type Layout, setNodeParams, type NodeParams } from '../layout';
import { getApp } from '../app';

const defaultSettings = {
	showChangelog: false,
	showAverages: true,
	showIncludeMarkers: true,
	showMagneticClouds: true,
	plotOffset: [-24, 48],
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
	set: <T extends keyof EventsSettings>(key: T, val: EventsSettings[T]) => void,
	setColumns: (fn: ((cols: string[]) => string[])) => void,
	setColumnOrder: (order: string[]) => void,
	reset: () => void,
};

export const useEventsSettings = create<EventsSettings>()(
	persist(
		set => ({
			...defaultSettings,
			set: (key, val) => set(state => ({ ...state, [key]: val })),
			setColumns: (fn) => set(state => ({ ...state, shownColumns: fn(state.shownColumns!) })),
			setColumnOrder: (val) => set(state => ({ ...state, columnOrder: val })),
			reset: () => set(defaultSettings)
		}), {
			name: 'eventsAppSettings'
		}
	)
);

export type TableParams = {
	showChangelog: boolean,
	showAverages: boolean,
	showIncludeMarkers?: boolean,
};

export type CommonPlotParams = Omit<GSMParams & SWParams & IMFParams & CirclesParams & GeomagnParams, 'interval'|'transformText'>;
export const defaultPlotParams: CommonPlotParams = {
	showMetaInfo: true,
	showMetaLabels: true,
	showTimeAxis: true,
	showEventsEnds: false,
	showGrid: true,
	showMarkers: true,
	showLegend: false,
	useA0m: true,
	subtractTrend: true,
	showAz: true,
	showAxy: true,
	showAxyVector: false,
	showBeta: true,
	showDensity: true,
	showPrecursorIndex: false,
	maskGLE: true,
	useAp: false,
	showBz: true,
	showBxBy: false,
	useTemperatureIndex: true,
	rsmExtended: false
};

export type ColumnDef = {
	name: string,
	fullName: string,
	type: 'real' | 'integer' | 'text' | 'enum' | 'time',
	description?: string,
	enum?: string[],
	nullable: boolean,
	entity: string,
	width: number,
	id: string,
	sqlName: string, // not unique across tables
	hidden?: boolean,
	isComputed: boolean,
	generic?: GenericColumn,
	parseName: null | string,
	parseValue: null | { [key: string|number]: string|number|null }
};

export const statPanelOptions = [ 'Histogram', 'Correlation', 'Superposed epochs', 'Events history' ] as const;
export const plotPanelOptions = [ 'Cosmic Rays', 'IMF + Speed', 'SW Plasma', 'SW Types', 'Geomagn', 'Ring of Stations' ] as const;
export const allPanelOptions = [ ...plotPanelOptions, ...statPanelOptions,
	'MainTable', 'ExportPreview', 'ExportControls', 'ColorSettings', 'InsertControls', 'Empty' ] as const;

export type PanelParams = NodeParams<Partial<CommonPlotParams>
& Partial<TableParams & CorrelationParams & HistogramParams & CollisionOptions & HistoryOptions>>;

export type Onset = { time: Date, type: string | null, secondary?: boolean, insert?: boolean };
export type MagneticCloud = { start: Date, end: Date };
export type ChangeLog = {
	[id: string]: {
		[col: string]: [
			{
				time: number,
				author: string,
				old: string,
				new: string,
				special: 'import' | null
			}
		]
	}
};

export type Value = Date | string | number | null;
export type DataRow = [number, ...Array<Value>];
export type ChangeValue = { id: number, column: ColumnDef, value: Value };
export type Sort = { column: string, direction: 1 | -1 };
export type Cursor = { row: number, column: number, editing?: boolean };
export type FiltersCollection = { filter: Filter, id: number }[];

export const MainTableContext = createContext<{ data: DataRow[], columns: ColumnDef[],
	firstTable: string, tables: string[], series: {[s: string]: string},
	changelog?: ChangeLog, changes: ChangeValue[], makeChange: (c: ChangeValue) => boolean }>({} as any);

export const SampleContext = createContext<{ data: DataRow[], current: Sample | null, samples: Sample[]	}>({} as any);

export const TableViewContext = createContext<{ data: DataRow[], columns: ColumnDef[],
	markers: null | string[], includeMarkers: null | string[] }>({} as any);

export const PlotContext = createContext<null | { interval: [Date, Date], onsets: Onset[], clouds: MagneticCloud[] }>({} as any);

const defaultViewSate = {
	cursor: null as Cursor | null,
	sort: { column: 'fe_time', direction: 1 } as Sort,
	plotId: null as number | null,
	modifyId: null as number | null,
	insertAt: null as Date | null
};

type ViewState = typeof defaultViewSate & {
	setEditing: (val: boolean) => void,
	setModify: (val: number | null) => void,
	setInsert: (val: Date | null) => void,
	setCursor: (cursor: ViewState['cursor']) => void,
	toggleSort: (column: string, dir?: Sort['direction']) => void,
	setPlotId: (setter: (a: ViewState['plotId']) => ViewState['plotId']) => void,
	escapeCursor: () => void,
};

export const useViewState = create<ViewState>()(
	immer(
		set => ({
			...defaultViewSate,
			setEditing: (val) => set(st => { if (st.cursor) st.cursor.editing = val; }),
			setModify: (val) => set(st => { st.modifyId = val; }),
			setInsert: (val) => set(st => { st.insertAt = val; }),
			setCursor: (cursor) => set(st => ({ ...st, cursor })),
			toggleSort: (column, dir) => set(st => ({ ...st, sort: { column,
				direction: dir ?? (st.sort.column === column ? -1 * st.sort.direction : 1) } })),
			setPlotId: (setter) => set(st => ({ ...st, plotId: setter(st.plotId) })),
			escapeCursor: () => set(st => { st.cursor = st.cursor?.editing ? { ...st.cursor, editing: false } : null; })
		})
	)
);

export type TableMenuDetails = {
	header?: ColumnDef,
	averages?: { averages: (number[] | null)[], label: string, row: number, column: number } ,
	cell?: { id: number, column: ColumnDef, value: Value }
};

export function copyAverages({ averages, row, column }: Required<TableMenuDetails>['averages'], what: 'all' | 'row' | 'col') {
	if (what === 'col')
		return navigator.clipboard.writeText(averages[column]?.map(c => c.toFixed(2)).join(',') ?? '');
	const filtered = averages.filter(r => r);
	const rows = filtered[0]!.map((_, ri) => filtered.map(col => col![ri].toFixed(2)).join(','));
	const text = what === 'all' ? rows.join('\r\n') : rows[row];
	navigator.clipboard.writeText(text);
}

export const findColumn = (columns: ColumnDef[], name: string) => columns.find(c => c.fullName === name) ?? null;

export const prettyTable = (str: string) => str.split('_').map((s: string) => s.charAt(0).toUpperCase()+s.slice(1)).join(' ');
export const shortTable = (ent: string) => prettyTable(ent).replace(/([A-Z])[a-z ]+/g, '$1');

export function equalValues(a: Value, b: Value) {
	return a instanceof Date ? (a as Date).getTime() === (b as Date|null)?.getTime() : a === b;
}

export function parseColumnValue(val: string, column: ColumnDef) {
	switch (column.type) {
		case 'time': return new Date(val.includes(' ') ? val.replace(' ', 'T')+'Z' : val);
		case 'real': return parseFloat(val);
		case 'integer': return parseInt(val);
		default: return val;
	}
}

export function valueToString(v: Value) {
	if (v instanceof Date)
		return v.toISOString().replace(/(:00)?\..+/, '').replace('T', ' ');
	if (typeof v === 'number')
		return parseFloat(v.toFixed(Math.max(0, 3 - v.toFixed(0).length))).toString();
	return v?.toString() ?? '';
}

export function isValidColumnValue(val: Value, column: ColumnDef) {
	if (val == null)
		return column.nullable;
	switch (column.type) {
		case 'time': return (val instanceof Date) && !isNaN(val.getTime());
		case 'real':
		case 'integer': return (typeof val == 'number') && !isNaN(val);
		case 'enum': return column.enum?.includes(val as string);
		default:
			return val !== '';
	}
}

export const setStatColumn = (col: ColumnDef, i: number) => {
	const { list, active } = useLayoutsStore.getState().apps[getApp()];
	const layout = list[active];
	const key = (['column0', 'column1'] as const)[i];
	for (const [id, iitem] of Object.entries(layout.items)) {
		if (statPanelOptions.includes(iitem?.type as any)) {
			const item = iitem as PanelParams;
			setNodeParams<PanelParams>(id, {
				[key]: item.type === 'Histogram' && item[key] === col.id ? null : col.id });
		}
	}
};

export const defaultLayouts: { [name: string]: Layout<PanelParams> } = {
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
			},
			top: {
				split: 'column',
				ratio: .6,
				children: ['p1', 'p2']
			},
			bottom: {
				split: 'column',
				ratio: .7,
				children: ['p3', 'p4']
			},
		},
		items: {
			left: {
				type: 'MainTable',
				showAverages: true,
				showChangelog: false,
			},
			p1: {
				type: 'IMF + Speed'
			},
			p2: {
				type: 'SW Plasma',
				showTimeAxis: false,
			},
			p3: {
				type: 'Cosmic Rays'
			},
			p4: {
				type: 'Geomagn',
				showTimeAxis: false,
			}
		}
	},
	stats: {
		tree: {
			root: {
				split: 'column',
				ratio: .5,
				children: ['top', 'bottom']
			},
			bottom: {
				split: 'row',
				ratio: .95,
				children: ['row', 'empty']
			},
			row: {
				split: 'row',
				ratio: .5,
				children: ['p1', 'p2']
			},
		},
		items: {
			top: {
				type: 'MainTable',
				showAverages: true,
				showChangelog: false,
			},
			p1: {
				type: 'Correlation'
			},
			p2: {
				type: 'Histogram',
			},
			empty: {
				type: 'Empty',
			},
		}
	},
	export: {
		tree: {
			root: {
				split: 'row',
				ratio: .5,
				children: ['left', 'rightTwo']
			},
			left: {
				split: 'row',
				ratio: .5,
				children: ['leftTwo', 'previewAnd']
			},
			previewAnd: {
				split: 'column',
				ratio: .7,
				children: ['preview', 'colors']
			},
			leftTwo: {
				split: 'column',
				ratio: .4,
				children: ['tbl', 'exp']
			},
			rightTwo: {
				split: 'column',
				ratio: .9,
				children: ['right', 'empty']
			},
			right: {
				split: 'column',
				ratio: .4,
				children: ['top', 'bottom']
			},
			bottom: {
				split: 'column',
				ratio: .7,
				children: ['p3', 'p4']
			},
		},
		items: {
			tbl: {
				type: 'MainTable'
			},
			exp: {
				type: 'ExportControls'
			},
			colors: {
				type: 'ColorSettings'
			},
			empty: {
				type: 'Empty',
			},
			preview: {
				type: 'ExportPreview'
			},
			top: {
				type: 'IMF + Speed',
				showTimeAxis: false,
			},
			p3: {
				type: 'Cosmic Rays'
			},
			p4: {
				type: 'Geomagn',
				showTimeAxis: false,
			}
		}
	}
};