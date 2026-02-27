import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Column, ComputedColumn } from '../../api';

export type Value = Date | string | number | null;
export type DataRow = [number, ...Array<Value>];

export const columnInputs = ['is_public', 'name', 'description', 'definition'] as const;

export type ColumnInputs = (typeof columnInputs)[number];
export type State = {
	focusColumn: Column | null;
	focusStick: boolean;
} & Pick<ComputedColumn, ColumnInputs>;

const defaultState: State = {
	is_public: false,
	name: '',
	description: null,
	definition: '',
	focusColumn: null,
	focusStick: false,
};

type Storage = State & {
	resetFocus: () => void;
	set: <K extends keyof State>(k: K, val: Storage[K]) => void;
	reset: () => void;
	isDirty: () => boolean;
};

export const useColumnsState = create<Storage>()(
	immer((set, get) => ({
		...defaultState,
		resetFocus: () =>
			set((state) => {
				if (!state.isDirty()) {
					for (const c of columnInputs) (state as any)[c] = defaultState[c];
					state.focusColumn = null;
					state.focusStick = false;
				}
			}),
		set: (k, val) =>
			set((state) => {
				if (k === 'focusColumn') {
					for (const c of columnInputs) (state as any)[c] = (val as ComputedColumn)?.[c] ?? defaultState[c];
				}
				state[k] = val;
			}),
		reset: () => set(defaultState),
		isDirty: () => {
			const { focusColumn, ...state } = get();
			return !!columnInputs.find((k) =>
				focusColumn
					? state[k] !== ((focusColumn as ComputedColumn)[k] ?? defaultState[k])
					: state[k] !== defaultState[k],
			);
		},
	})),
);

export function computeColumnWidth(column: Column) {
	switch (column.dtype) {
		case 'enum':
			return 50;
		case 'time':
			return 156;
		case 'text':
			return 120;
		case 'integer':
			return 48;
		default:
			return 64;
	}
}
