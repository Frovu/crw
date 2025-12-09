import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Column, ComputedColumn } from '../../api';

export type Value = Date | string | number | null;
export type DataRow = [number, ...Array<Value>];

export type ColumnState = {
	id: number | null;
} & Pick<ComputedColumn, 'is_public' | 'name' | 'description' | 'definition'>;

const defaultState: ColumnState = {
	id: null,
	is_public: false,
	name: '',
	description: null,
	definition: '',
};

type Storage = ColumnState & {
	setColumn: (col: ComputedColumn) => void;
	set: <K extends keyof ColumnState>(k: K, val: Storage[K]) => void;
	reset: () => void;
};

export const useComputedColumnState = create<Storage>()(
	immer((set) => ({
		...defaultState,
		setColumn: (col) =>
			set((state) => {
				Object.assign(state, col);
			}),
		set: (k, val) =>
			set((state) => {
				state[k] = val;
			}),
		reset: () => set(defaultState),
	}))
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
