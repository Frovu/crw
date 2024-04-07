import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { SW_TYPES } from '../plots/time/SWTypes';
import type { ColumnDef } from './events';

export const EXTREMUM_OP = ['min', 'max', 'abs_min', 'abs_max'] as const;
export const G_COMBINE_OP = ['diff', 'abs_diff'] as const;
export const G_VALUE_OP = ['time_offset', 'time_offset_%', ...EXTREMUM_OP, 'mean', 'median', 'range', 'coverage'] as const;
export const G_ALL_OPS = [...G_VALUE_OP, ...G_COMBINE_OP, 'clone_column'];

export type RefPointExtremum = {
	type: 'extremum',
	hours_offset: number,
	operation: typeof EXTREMUM_OP[number],
	series: string,
};
export type RefPointSWStruct = {
	type: 'sw_structure',
	hours_offset: number,
	structure: typeof SW_TYPES[number],
	end?: boolean
};
export type RefPointEvent = {
	type: 'event',
	hours_offset: number,
	events_offset: number,
	entity: string,
	end?: boolean,
};
export type ReferencePoint = RefPointExtremum | RefPointSWStruct | RefPointEvent;

export type GenericParamsClone = {
	operation: 'clone_column',
	column: string,
	events_offset: number,
};
export type GenericParamsCombine = {
	operation: typeof G_COMBINE_OP[number],
	column: string,
	other_column: string,
};
export type GenericParamsValue = {
	operation: typeof G_VALUE_OP[number],
	reference: ReferencePoint,
	boundary: ReferencePoint,
	series?: string // if not time_offset
};
export type GenericParams = GenericParamsClone | GenericParamsCombine | GenericParamsValue;
export type GenericParamsOptions = { operation: typeof G_ALL_OPS[number] } & Omit<GenericParamsClone, 'operation'>
& Omit<GenericParamsCombine, 'operation'> & Omit<GenericParamsValue, 'operation'>;

export type GenericColumn = {
	id: number,
	entity: string,
	is_public: boolean,
	is_own: boolean,
	nickname: string | null,
	description: string | null,
	params: GenericParams,
};

export type GenericState = Partial<Omit<GenericColumn, 'params'>> & {
	params: Partial<GenericParamsOptions>,
	setGeneric: (g: GenericColumn) => void,
	set: <K extends keyof GenericState>(k: K, val: GenericState[K]) => void,
	reset: () => void,
	setParam: <K extends keyof GenericParamsOptions>(k: K, val?: GenericParamsOptions[K]) => void,
	setPoint: (k: 'reference'|'boundary', val: string) => void,
	setPointHours: (k: 'reference'|'boundary', val: number) => void,
	setPointSeries: (k: 'reference'|'boundary', val: string) => void,
	setPointStruct: (k: 'reference'|'boundary', val: string) => void,
};

export const defaultRefPoint = {
	type: 'event', entity: 'forbush_effects', hours_offset: 0, events_offset: 0
} as const as RefPointEvent;

const defaultState = {
	entity: defaultRefPoint.entity,
	id: undefined,
	is_public: false,
	is_own: undefined,
	nickname: undefined,
	description: undefined,
	params: {},
};

export const useGenericState = create<GenericState>()(immer(set => ({
	...defaultState,
	setGeneric: g => set(state => { Object.assign(state, g); }),
	set: (k, val) => set(state => { state[k] = val; }),
	reset: () => set(defaultState),
	setParam: (k, val) => set((state) => {
		let inp = state.params;
		if (k === 'operation') {
			const type = (op?: any) => op === 'clone_column' ? 'clone'
				: op?.startsWith('time_offset') ? 'time': G_VALUE_OP.includes(op) ? 'value' : 'combine';
			const typeChanged = type(inp?.operation) !== type(val);
			state.params = inp = { ...(!typeChanged && inp), [k]: val };
			if (typeChanged && val === 'clone_column')
				inp.events_offset = 0;
			if (typeChanged && G_VALUE_OP.includes(val as any)) {
				inp.reference = { ...defaultRefPoint, entity: state.entity ?? defaultRefPoint.entity };
				inp.boundary = { ...inp.reference, end: true };
			}
		} else {
			inp[k] = val;
		}
	}),
	setPoint: (k, val) => set(({ params }) => {
		const type = EXTREMUM_OP.includes(val as any) ? 'extremum'
			: val.endsWith('sws') ? 'sw_structure' : 'event';
		const inp = params[k];
		const hours_offset = inp?.hours_offset ?? 0;
		if (type === 'extremum') {
			const series = inp?.type === 'extremum' ? inp.series : 'v_sw';
			params[k] = { type, operation: val as any, hours_offset, series } ;
		} else if (type === 'sw_structure') {
			const structure = inp?.type === 'sw_structure' ? inp.structure : 'SH';
			const end = val.includes('end+');
			params[k] = { type, hours_offset, structure, end };
		} else if (type === 'event') {
			const entity = val.split('+').at(-1)!;
			const end = val.includes('end+');
			const events_offset = val.includes('prev+') ? -1 :  val.includes('next+') ? 1 : 0;
			params[k] = { type, entity, events_offset, hours_offset, end };
		}
	}),
	setPointHours: (k, val) => set(({ params: { [k]: point } }) => { if (point) point.hours_offset = val; }),
	setPointSeries: (k, val) => set(({ params: { [k]: point } }) => { if (point?.type === 'extremum') point.series = val; }),
	setPointStruct: (k, val) => set(({ params: { [k]: point } }) => { if (point?.type === 'sw_structure') point.structure = val as any; }),
})));

export function fromDesc(table: string, sqlName: string, desc: ColumnDef, firstTable: string) {
	const width = (()=>{
		switch (desc.type) {
			case 'enum': return Math.max(5, ...(desc.enum!.map(el => el.length)));
			case 'time[]': return 17;
			case 'time': return 17;
			case 'text': return 14;
			default: return 6; 
		}
	})();
	const shortTable = table.replace(/([a-z])[a-z ]+_?/gi, '$1');
	const fullName = desc.name + (table !== firstTable ? ' of ' + shortTable.toUpperCase() : '');
	return {
		...desc, width, sqlName,
		entity: table,
		name: desc.name.length > 30 ? desc.name.slice(0, 30)+'..' : desc.name,
		fullName: fullName.length > 30 ? fullName.slice(0, 30)+'..' : fullName,
		description: desc.name.length > 20 ? (desc.description ? (fullName + '\n\n' + desc.description) : '') : desc.description
	} as ColumnDef;

}