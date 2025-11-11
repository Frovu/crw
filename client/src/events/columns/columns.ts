import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { apiGet } from '../../util';
import type { Column, ComputedColumn } from '../../api.d';

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
			return Math.max(5, ...column.enum!.map((el) => el.length));
		case 'time':
			return 17;
		case 'text':
			return 14;
		default:
			return 6;
	}
}
