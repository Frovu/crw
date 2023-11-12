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
import { GenericColumn } from './Columns';
import { CorrelationParams } from '../plots/Correlate';
import { HistogramParams } from '../plots/Histogram';

export type EventsSettings = {
	shownColumns: string[],
	showGrid: boolean,
	showMarkers: boolean,
	showLegend: boolean,
	showMagneticClouds: boolean,
	plotOffset: number[],
	plotUnlistedEvents: boolean,
	set: <T extends keyof EventsSettings>(key: T, val: EventsSettings[T]) => void,
	setColumns: (fn: ((cols: string[]) => string[])) => void
	reset: () => void
};

const defaultSettings = {
	shownColumns: ['fe_time', 'fe_onset_type', 'fe_magnitude', 'fe_v_max', 'fe_v_before',
		'fe_bz_min', 'fe_kp_max', 'fe_axy_max', 'ss_type', 'ss_description', 'ss_confidence'],
	showChangelog: false,
	showAverages: true,
	showMagneticClouds: true,
	plotOffset: [-24, 48],
	plotUnlistedEvents: true,
	showGrid: true,
	showMarkers: true,
	showLegend: false,
};

export const useEventsSettings = create<EventsSettings>()(
	persist(
		set => ({
			...defaultSettings,
			set: (key, val) => set(state => ({ ...state, [key]: val })),
			setColumns: (fn) => set(state => ({ ...state, shownColumns: fn(state.shownColumns) })),
			reset: () => set(defaultSettings)
		}), {
			name: 'eventsAppSettings'
		}
	)
);

export type TableParams = {
	showChangelog: boolean,
	showAverages: boolean,
};

export type CommonPlotParams = Omit<GSMParams & SWParams & IMFParams & CirclesParams & GeomagnParams, 'interval'|'transformText'>;
export const defaultPlotParams: CommonPlotParams = {
	showMetaInfo: true,
	showMetaLabels: true,
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
	showPrecursorIndex: false,
	maskGLE: true,
	useAp: false,
	showBz: true,
	showBxBy: false,
	useTemperatureIndex: false,
	rsmExtended: false
};

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
	generic?: GenericColumn,
	parseName: null | string,
	parseValue: null | { [key: string|number]: string|number|null }
};

export const statPanelOptions = [ 'Histogram', 'Correlation', 'Epoch collision' ] as const;
export const plotPanelOptions = [ 'Cosmic Rays', 'IMF + Speed', 'SW Plasma', 'Geomagn', 'Ring of Stations' ] as const;
export const allPanelOptions = [ ...plotPanelOptions, ...statPanelOptions, 'MainTable', 'ExportPreview', 'ExportControls', 'Empty' ] as const;

export const isPanelDraggable = (panel?: string) => panel !== 'MainTable';
export const isPanelDuplicatable = (panel?: string) => statPanelOptions.includes(panel as any);

export type PanelParams = {
	type?: typeof allPanelOptions[number],
	tableParams?: TableParams,
	plotParams?: Partial<CommonPlotParams>,
	statParams?: Partial<CorrelationParams & HistogramParams>,
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

export const SampleContext = createContext<{ data: DataRow[], current: Sample | null, samples: Sample[],
	apply: (data: DataRow[], sampleId: number) => DataRow[] }>({} as any);

export const TableViewContext = createContext<{ data: DataRow[], columns: ColumnDef[], markers: null | string[] }>({} as any);

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
				type: 'MainTable',
				tableParams: {
					showAverages: true,
					showChangelog: false,
				}
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
				tableParams: {
					showAverages: true,
					showChangelog: false,
				}
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
				children: ['leftTwo', 'preview']
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
			empty: {
				type: 'Empty',
			},
			preview: {
				type: 'ExportPreview'
			},
			top: {
				type: 'IMF + Speed',
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