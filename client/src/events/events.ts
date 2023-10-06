import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Filter, Sample } from './sample';
import { Layout } from '../Layout';
import { createContext } from 'react';
import { CirclesParams } from '../plots/time/Circles';
import { GSMParams } from '../plots/time/GSM';
import { GeomagnParams } from '../plots/time/Geomagn';
import { IMFParams } from '../plots/time/IMF';
import { SWParams } from '../plots/time/SW';
import { immer } from 'zustand/middleware/immer';

export type EventsSettings = {
	showColumns: string[],
	showGrid: boolean,
	showMarkers: boolean,
	showLegend: boolean,
	plotOffsetDays: number[],
	plotUnlistedEvents: boolean,
	set: <T extends keyof EventsSettings>(key: T, val: EventsSettings[T]) => void,
	reset: () => void
};

const defaultSettings = {
	showColumns: ['fe_time', 'fe_onset_type', 'fe_magnitude', 'fe_v_max', 'fe_v_before',
		'fe_bz_min', 'fe_kp_max', 'fe_axy_max', 'ss_type', 'ss_description', 'ss_confidence'],
	showChangelog: false,
	showAverages: true,
	plotOffsetDays: [-1, 2],
	plotUnlistedEvents: true,
	showGrid: true,
	showMarkers: true,
	showLegend: false,
};

export type TableParams = {
	showChangelog: boolean,
	showAverages: boolean,
};

export type CommonPlotParams = Omit<GSMParams & SWParams & IMFParams & CirclesParams & GeomagnParams, 'interval'|'transformText'>;
export const defaultPlotParams: CommonPlotParams = {
	showMetaInfo: true,
	showTimeAxis: true,
	showGrid: true,
	showMarkers: true,
	showLegend: false,
	useA0m: true,
	subtractTrend: true,
	showAz: true,
	showAxy: true,
	showAxyVector: false,
	showBeta: true,
	maskGLE: true,
	useAp: false,
	showBz: true,
	showBxBy: false,
	useTemperatureIndex: false,
	rsmExtended: false
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

export const statPanelOptions = [ 'Histogram', 'Correlation', 'Epoch collision' ] as const;
export const plotPanelOptions = [ 'Cosmic Rays', 'IMF + Speed', 'SW Plasma', 'Geomagn', 'Ring of Stations' ] as const;
export const allPanelOptions = [ ...plotPanelOptions, ...statPanelOptions, 'MainTable', 'ExportControls' ] as const;

export const isPanelDraggable = (panel: string) => plotPanelOptions.includes(panel as any);
export const isPanelDuplicatable = (panel: string) => statPanelOptions.includes(panel as any);

export type PanelParams = {
	type?: typeof allPanelOptions[number],
	tableParams?: TableParams,
	plotParams?: Partial<CommonPlotParams>,
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
				type: 'MainTable'
			},
			p1: {
				type: 'IMF + Speed'
			},
			p2: {
				type: 'SW Plasma',
				plotParams: {
					showTimeAxis: false,
				}
			},
			p3: {
				type: 'Cosmic Rays'
			},
			p4: {
				type: 'Geomagn',
				plotParams: {
					showTimeAxis: false,
				}
			}
		}
	},
	export: {
		tree: {
			root: {
				split: 'row',
				ratio: .4,
				children: ['left', 'right']
			},
			left: {
				split: 'column',
				ratio: .4,
				children: ['tbl', 'exp']
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
			tbl: {
				type: 'MainTable'
			},
			exp: {
				type: 'ExportControls'
			},
			p1: {
				type: 'IMF + Speed'
			},
			p2: {
				type: 'SW Plasma',
				plotParams: {
					showTimeAxis: false,
				}
			},
			p3: {
				type: 'Cosmic Rays'
			},
			p4: {
				type: 'Geomagn',
				plotParams: {
					showTimeAxis: false,
				}
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
export type DataRow = [number, ...Array<Value>];
export type ChangeValue = { id: number, column: ColumnDef, value: Value };
export type Sort = { column: string, direction: 1 | -1 };
export type Cursor = { row: number, column: number, editing?: boolean };
export type FiltersCollection = { filter: Filter, id: number }[];

export const MainTableContext = createContext<{ data: DataRow[], columns: ColumnDef[],
	firstTable: string, tables: string[], series: {[s: string]: string},
	changelog?: ChangeLog, changes: ChangeValue[], makeChange: (c: ChangeValue) => boolean }>({} as any);

export const SampleContext = createContext<{ data: DataRow[], current: Sample | null, samples: Sample[],
	apply: (data: DataRow[], sampleId: number) => DataRow[] }>({} as any);

export const TableViewContext = createContext<{ data: DataRow[], columns: ColumnDef[], averages: (null | number[])[], markers: null | string[] }>({} as any);

export const PlotContext = createContext<null | { interval: [Date, Date], onsets: Onset[], clouds: MagneticCloud[] }>({} as any);

type ViewState = {
	cursor: Cursor | null,
	sort: Sort,
	plotId: number | null,
	setEditing: (val: boolean) => void,
	setCursor: (cursor: ViewState['cursor']) => void,
	toggleSort: (column: string, dir?: Sort['direction']) => void,
	setPlotId: (setter: (a: ViewState['plotId']) => ViewState['plotId']) => void,
	escapeCursor: () => void,
};

const defaultViewSate = {
	cursor: null,
	sort: { column: 'fe_time', direction: 1 } as const,
	plotId: null,
};

export const useViewState = create<ViewState>()(
	immer(
		set => ({
			...defaultViewSate,
			setEditing: (val) => set(st => { if (st.cursor) st.cursor.editing = val; }),
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
	cell?: { id: number, column: ColumnDef, value: Value }
};

export const prettyTable = (str: string) => str.split('_').map((s: string) => s.charAt(0).toUpperCase()+s.slice(1)).join(' ');

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