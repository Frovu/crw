import { create } from 'zustand';
import { ColumnDef, parseColumnValue } from './events';
import { immer } from 'zustand/middleware/immer';

export const FILTER_OPS = ['>=' , '<=' , '==', '<>' , 'is null', 'not null' , 'regexp'] as const;
export type Filter = {
	operation: typeof FILTER_OPS[number],
	column: string,
	value: string,
	id?: number
};

export type Sample = {
	id: number,
	name: string,
	filters: Filter[],
	whitelist: number[],
	blacklist: number[]
	authors: string[],
	public: boolean,
};

export type SampleState = {
	showDetails: boolean,
	isPicking: boolean,
	current: null | Sample,
	filters: Filter[],
	set: (a: Partial<Sample>) => void,
	setPicking: (a: boolean) => void,
	setShow: (a: boolean) => void,
	addFilter: (filter?: Filter) => void,
	changeFilter: (filter: Filter) => void,
	removeFilter: (id?: number) => void,
	setSample: (s: null | Sample) => void
};

const defaultFilter = { column: 'fe_magnitude', operation: '>=', value: '3' } as const;

export const useSampleState = create<SampleState>()(immer(set => ({
	showDetails: false,
	isPicking: false,
	current: null,
	filters: [],
	set: (arg) => set(state => { state.current && Object.assign(state.current, arg); }),
	setPicking: (arg) => set(st => ({ ...st, isPicking: arg })),
	setShow: (arg) => set(st => ({ ...st, showDetails: arg })),
	addFilter: (filter) => set(state => {
		const target = state.current ?? state;
		const fl = filter ?? state.filters.at(-1) ?? defaultFilter;
		target.filters.push({ ...fl, id: Date.now() });
	}),
	changeFilter: (filter) => set(state => {
		const target = state.current ?? state;
		target.filters = target.filters.map(f => f.id !== filter.id ? f : filter);
	}),
	removeFilter: (id) => set(state => {
		const target = state.current ?? state;
		target.filters = target.filters.filter((f) => f.id !== id);
	}),
	setSample: (sample) => set(state => {
		state.current = sample;
		if (state.current) {
			state.current.filters = state.current.filters.map(
			   (f, i) => ({ ...f, id: Date.now() + i })) ?? [];
		} else {
			state.isPicking = false;
			state.filters = [];
		}
	}) 
})));

export function renderFilters(filters: Filter[], columns: ColumnDef[]) {
	const fns = filters.map(fl => {
		const columnIdx = columns.findIndex(c => c.id === fl.column);
		if (columnIdx < 0) return null;
		const column = columns[columnIdx];
		const fn = (() => {
			const { operation } = fl;
			if (operation === 'is null')
				return (v: any) => v == null;
			if (operation === 'not null')
				return (v: any) => v != null;
			if (operation === 'regexp') {
				const regexp = new RegExp(fl.value);
				return (v: any) => regexp.test(v?.toString());
			}
			if (!fl.value) return null;
			const value = parseColumnValue(fl.value, column);
			switch (operation) {
				case '>=': return (v: any) => v != null && v >= value;
				case '<=': return (v: any) => v != null && v <= value;
				case '==': return (v: any) => v === value;
				case '<>': return (v: any) => v != null && v !== value;
			}
		})();
		return fn && ((row: any[]) => fn(row[columnIdx]));
	}).filter(fn => fn) as ((row: any[]) => boolean)[];
	return (row: any[]) => !fns.some(fn => !fn(row));
}

export function applySample(data: any[][], sample: Sample | null, columns: ColumnDef[]) {
	if (!sample) return data;
	const filter = sample.filters?.length && renderFilters(sample.filters, columns);	
	return data.filter(row => (filter ? filter(row) : !sample.whitelist.length) || sample.whitelist.includes(row[0]))
		.filter(row => !sample.blacklist.includes(row[0]));
}

export function sampleEditingMarkers(data: any[][], sample: Sample, columns: ColumnDef[]) {
	const filterFn = sample.filters && renderFilters(sample.filters, columns);
	return data.map(row => {
		const fl = filterFn && filterFn(row) && 'f';
		const wl = sample.whitelist.includes(row[0]) && '+'; 
		const bl = sample.blacklist.includes(row[0]) && '-'; 
		return (fl || ' ') + (wl || bl || ' ');
	});
}
