import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createContext } from 'react';
import type { Filter, Sample } from './sample';
import type { CirclesParams } from '../plots/time/Circles';
import type { GSMParams } from '../plots/time/GSM';
import type { GeomagnParams } from '../plots/time/Geomagn';
import type { IMFParams } from '../plots/time/IMF';
import type { SWParams } from '../plots/time/SW';
import type { CorrelationParams } from '../plots/Correlate';
import type { HistogramParams } from '../plots/Histogram';
import type { CollisionOptions } from '../plots/EpochCollision';
import type { HistoryOptions } from '../plots/EventsHistory';
import type { SatXraysParams } from '../plots/time/XRays';
import { useLayoutsStore, type Layout, setNodeParams, type NodeParams } from '../layout';
import { getApp } from '../app';
import type { ColumnDef, Value, DataRow } from './columns';
import type { SatPartParams } from '../plots/time/Particles';

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
	hideHeader?: boolean,
	showIncludeMarkers?: boolean,
};

export type CommonPlotParams = Omit<GSMParams & SWParams & IMFParams & CirclesParams & GeomagnParams & SatXraysParams & SatPartParams, 'interval'|'transformText'>;
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
	rsmExtended: false,

	showShortXrays: true,
	solarTime: true
};
export const statPanelOptions = [ 'Histogram', 'Correlation', 'Superposed epochs', 'Events history' ] as const;
export const solarPlotOptions = ['CME height', 'X-Rays', 'Particles'] as const;
export const plotPanelOptions = [ 'Cosmic Rays', 'IMF + Speed', 'SW Plasma', 'SW Types', 'Geomagn', 'Ring of Stations', ...solarPlotOptions] as const;
export const allPanelOptions = [ ...plotPanelOptions, ...statPanelOptions,
	'FEID Table', 'Sun View', 'ExportPreview', 'ExportControls', 'ColorSettings', 'InsertControls', 
	'Erupt Src Table', 'Flares Table', 'CME Table', 'ICME Table', 'Holes Src Table', 'Solen Holes', 'Chimera Holes', 'Empty' ] as const;

export type PanelParams = NodeParams<Partial<CommonPlotParams>
& Partial<TableParams & CorrelationParams & HistogramParams & CollisionOptions & HistoryOptions>>;

export type Onset = { time: Date, type: string | null, secondary?: boolean, insert?: boolean };
export type MagneticCloud = { start: Date, end: Date };

export type ChangeLogEntry = {
	time: number,
	author: string,
	old: string,
	new: string,
	special: 'import' | null
}[];

export type ChangeLog = {
	fields: string[],
	events: {
		[id: string]: {
			[col: string]: (number | null | string)[][]
		}
	}
};

export const getChangelogEntry = (chl: ChangeLog | undefined, eid: number, cid: string) =>
	chl?.events[eid]?.[cid]?.map(row =>
		Object.fromEntries(chl.fields.map((f, i) => [f, row[i]]))) as ChangeLogEntry | undefined;

export type ChangeValue = { id: number, column: ColumnDef, value: Value, silent?: boolean };
export type FiltersCollection = { filter: Filter, id: number }[];

export const MainTableContext = createContext<{
	columns: ColumnDef[],
	columnIndex: { [col: string]: number },
	structure: { [col: string]: ColumnDef[] },
	rels: {[s: string]: string},
	series: {[s: string]: string},
	changelog?: ChangeLog
}>({} as any);

export const SampleContext = createContext<{ data: DataRow[], current: Sample | null, samples: Sample[]	}>({} as any);

export const TableViewContext = createContext<{ data: DataRow[], columns: ColumnDef[],
	markers: null | string[], includeMarkers: null | string[] }>({} as any);

export const PlotContext = createContext<null | { interval: [Date, Date], onsets: Onset[], clouds: MagneticCloud[] }>({} as any);

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

export function equalValues(a?: any, b?: any) {
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
		return v.toISOString().replace(/:\d\d\..+/, '').replace('T', ' ');
	if (typeof v !== 'number')
		return v?.toString() ?? '';
	if (v !== 0 && (Math.abs(v) < 0.001 || Math.abs(v) > 99999))
		return v.toExponential(0);
	return parseFloat(v.toFixed(Math.max(0, 3 - v.toFixed(0).length))).toString();
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
				type: 'FEID Table',
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
				type: 'FEID Table',
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
				type: 'FEID Table'
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