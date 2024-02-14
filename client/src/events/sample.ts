import { create } from 'zustand';
import { type ColumnDef, type DataRow, type Value, parseColumnValue } from './events';
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
	includes: number[],
	filters: Filter[],
	whitelist: number[],
	blacklist: number[]
	authors: string[],
	public: boolean,
	created: Date,
	modified: Date
};

export type SampleState = {
	showDetails: boolean,
	isPicking: boolean,
	current: null | Sample,
	filters: Filter[],
	set: (a: Partial<Sample>) => void,
	setPicking: (a: boolean) => void,
	setShow: (a: boolean) => void,
	addFilter: (column: ColumnDef, val?: Value) => void,
	changeFilter: (filter: Filter) => void,
	removeFilter: (id?: number) => void,
	changeInclude: (id: number | null, newId: number) => void,
	removeInclude: (id: number) => void,
	clearFilters: () => void,
	setSample: (s: null | Sample) => void
};

const defaultFilter = { operation: '>=', value: '3' } as const;

export const defaultFilterOp = (column: ColumnDef, val: Value) =>
	val == null ? 'not null' : column.type === 'enum' ? '==' : column.type === 'text' ? 'regexp' : '>=';

export const useSampleState = create<SampleState>()(immer(set => ({
	showDetails: false,
	isPicking: false,
	current: null,
	filters: [],
	set: (arg) => set(state => { state.current && Object.assign(state.current, arg); }),
	setPicking: (arg) => set(st => ({ ...st, isPicking: arg })),
	setShow: (arg) => set(st => ({ ...st, isPicking: false, showDetails: arg, filters: arg ? [] : st.filters })),
	addFilter: (column, val) => set(state => {
		const target = (state.showDetails ? state.current : null) ?? state;
		if (val !== undefined) {
			const operation = defaultFilterOp(column, val ?? null);
			const value = (val instanceof Date ? val.toISOString().replace(/T.*/,'') : val?.toString()) ?? '';
			target.filters.push({ column: column.id, operation, value, id: Date.now() });
		} else {
			const fl = state.filters.at(-1) ?? { column:  column.id, ...defaultFilter };
			target.filters.push({ ...fl, id: Date.now() });
		}
	}),
	changeFilter: (filter) => set(state => {
		const target = (state.showDetails ? state.current : null) ?? state;
		target.filters = target.filters.map(f => f.id !== filter.id ? f : filter);
	}),
	removeFilter: (id) => set(state => {
		const target = (state.showDetails ? state.current : null) ?? state;
		target.filters = target.filters.filter((f) => f.id !== id);
	}),
	changeInclude: (id, newId) => set(state => {
		const inc = state.current?.includes;
		if (!state.current || !inc) return;
		state.current.includes = (id == null || !inc.includes(id))
			? inc.concat(newId) : inc.map(i => i === id ? newId : i); 
	}),
	removeInclude: (id) => set(state => {
		if (!state.current) return;
		state.current.includes = state.current.includes?.filter(i => i !== id) ?? null; 
	}),
	clearFilters: () => set(state => ({ ...state, filters: [] })),
	setSample: (sample) => set(state => {
		if (sample == null) {
			state.current = null;
			state.isPicking = false;
			state.showDetails = false;
			state.filters = [];
		} else {
			state.current = { ...sample, filters: sample.filters?.map(
			   (f, i) => ({ ...f, id: Date.now() + i })) ?? [] };
		}
	})
})));

export function pickEventForSampe(action: 'whitelist' | 'blacklist', id: number) {
	useSampleState.setState(({ current, isPicking }) => {
		if (!current || !isPicking) return;
		const found = current[action].indexOf(id);
		const opposite = action === 'blacklist' ? 'whitelist' : 'blacklist';
		current[action] = found < 0 ? current[action].concat(id) : current[action].filter(i => i !== id);
		current[opposite] = current[opposite].filter(i => i !== id);
	});
}

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
				return (v: any) => regexp.test(v?.toString() ?? 'null');
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
		return fn && ((row: DataRow) => fn(row[columnIdx]));
	}).filter(fn => fn) as ((row: DataRow) => boolean)[];
	return (row: DataRow) => !fns.some(fn => !fn(row));
}

export function applySample(data: DataRow[], sample: Sample | null, columns: ColumnDef[], samples: Sample[]): DataRow[] {
	if (!sample) return data;
	const filter = sample.filters?.length && renderFilters(sample.filters, columns);
	const base = !sample.includes?.length ? data : (()=>{
		const set = sample.includes.reduce((acc, sid) => {
			const smpl = samples.find(s => s.id === sid);
			if (!smpl) return acc;
			const applied = applySample(data, smpl, columns, samples);
			const ent = Object.fromEntries(applied.map(r => [r[0], r]));
			return Object.assign(acc, ent);
		}, {}) as { [k: number]: DataRow };
		const timeIdx = columns.findIndex(c => c.fullName === 'time');
		return Object.values(set).sort((a, b) => a[timeIdx] as any - (b[timeIdx] as any));
	})();
	return base.filter(row => (filter ? filter(row) : !sample.whitelist.length) || sample.whitelist.includes(row[0]))
		.filter(row => !sample.blacklist.includes(row[0]));
}

export function sampleEditingMarkers(data: DataRow[], sample: Sample, columns: ColumnDef[]) {
	const filterFn = sample.filters && renderFilters(sample.filters, columns);
	return data.map(row => {
		const fl = filterFn && filterFn(row) && 'f';
		const wl = sample.whitelist.includes(row[0]) && '+'; 
		const bl = sample.blacklist.includes(row[0]) && '-'; 
		return (fl || ' ') + (wl || bl || ' ');
	});
}
