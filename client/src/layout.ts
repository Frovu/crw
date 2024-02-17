import { createContext } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { logMessage } from './app';
import { type PanelParams, defaultLayouts, isPanelDuplicatable, statPanelOptions, type ColumnDef } from './events/events';
import type { Size } from './util';

export const gapSize = 2;

type LayoutTreeNode = {
	split: 'row' | 'column',
	ratio: number, 
	children: [string, string],
};

export type Layout = {
	tree: { [key: string]: LayoutTreeNode | null },
	items: { [key: string]: PanelParams | undefined }
};

type LayoutsState = {
	dragFrom: null | string,
	dragTo: null | string,
	active: string,
	list: { [name: string]: Layout },
	updateRatio: (nodeId: string, ratio: number) => void,
	startDrag: (nodeId: string | null) => void,
	dragOver: (nodeId: string) => void,
	finishDrag: () => void,
	resetLayout: () => void,
	copyLayout: (la: string) => void,
	deleteLayout: (la: string) => void,
	selectLayout: (la: string) => void,
	renameLayout: (la: string, name: string) => void,
}; 

const defaultState = {
	dragFrom: null,
	dragTo: null,
	active: 'default',
	list: defaultLayouts,
};

export type LayoutsMenuDetails = { nodeId: string };

export const useLayoutsStore = create<LayoutsState>()(
	persist(
		immer((set, get) => ({
			...defaultState,
			startDrag: nodeId => set(state =>
				state.dragFrom === nodeId ? state : ({ ...state, dragFrom: nodeId, dragTo: nodeId == null ? null : state.dragTo })),
			dragOver: nodeId => set(state => state.dragFrom ? ({ ...state, dragTo: nodeId }) : state),
			finishDrag: () => set(({ list, active, dragFrom, dragTo }) => {
				if (!dragFrom || !dragTo) return;
				const items = list[active].items;
				[items[dragFrom], items[dragTo]] = [items[dragTo], items[dragFrom]];
			}),
			updateRatio: (nodeId, ratio) =>
				set(state => { state.list[state.active].tree[nodeId]!.ratio = ratio; }),
			selectLayout: layout => set(state => { if (state.list[layout]) state.active = layout; }),
			deleteLayout: layout => set(state => {
				logMessage('layout removed: ' + layout);
				delete state.list[layout];
				if (state.active === layout)
					state.active = 'default'; }),
			copyLayout: layout => set((state) => {
				const list = state.list;
				if (!list[layout]) return;
				const name = (i: number) => layout+'(copy)'+(i||'');
				const copyName = name([...Array(Object.keys(list).length).keys()].find(i => !list[name(i)])!);
				list[copyName] = list[layout];
				state.active = copyName;
			}),
			renameLayout: (layout, name) => set(state => {
				if (layout === name) return;
				state.list[name] = state.list[layout];
				delete state.list[layout];
				if (state.active === layout)
					state.active = name; }),
			resetLayout: () => set(({ list, active }) => {
				logMessage('layout reset: ' + active);
				if (defaultState.list[active]) list[active] = defaultState.list[active]; }),
		})),
		{
			name: 'eventsAppLayouts',
			partialize: ({ list, active }) => ({ list, active })
		}
	)
);

export type ParamsSetter = <T extends keyof PanelParams>(k: T, para: Partial<PanelParams[T]>) => void;
export const LayoutContext = createContext<{ id: string, size: Size, params: PanelParams, setParams: ParamsSetter } | null>(null);

export const setNodeParams = <T extends keyof PanelParams>(nodeId: string, k: T, para: Partial<PanelParams[T]>) =>
	useLayoutsStore.setState(state => {
		const { items } = state.list[state.active];
		items[nodeId]![k] = typeof items[nodeId]![k] == 'object' ? Object.assign(items[nodeId]![k] as any, para) : para;
	});

export const setStatColumn = (col: ColumnDef, i: number) => {
	const { list, active } = useLayoutsStore.getState();
	const key = (['column0', 'column1'] as const)[i];
	for (const [id, item] of Object.entries(list[active].items))
		if (statPanelOptions.includes(item?.type as any))
			setNodeParams(id, 'statParams', { [key]:
		item?.type === 'Histogram' && item?.statParams?.[key] === col.id ? null : col.id });
};

export const resetLayout = () => useLayoutsStore.setState(defaultState);

export const relinquishNode = (nodeId: string) => useLayoutsStore.setState(state => {
	const { tree, items } = state.list[state.active];
	const parent = Object.keys(tree).find(node => tree[node]?.children.includes(nodeId));
	if (!parent) return state;
	const otherNodeId = tree[parent]!.children.filter(ch => ch !== nodeId)[0];
	if (items[otherNodeId])
		items[parent] = items[otherNodeId];
	tree[parent] = tree[otherNodeId];
	delete tree[otherNodeId];
	delete items[nodeId];
	delete items[otherNodeId];
});

export const splitNode = (nodeId: string, split: 'row'|'column', inverse?: boolean) => useLayoutsStore.setState(state => {
	const { tree, items } = state.list[state.active];
	const [aId, bId] = ['A', 'B'].map(lt => lt + Date.now().toString());

	if (tree[nodeId])
		tree[aId] = tree[nodeId];
	tree[nodeId] = {
		split,
		ratio: .5,
		children: inverse ? [bId, aId] : [aId, bId] };
	if (items[nodeId])
		items[aId] = items[nodeId];
	items[bId] = isPanelDuplicatable(items[nodeId]?.type) ? { ...items[nodeId] } : {};
	delete items[nodeId];
});

export const useLayout = () => ({
	...useLayoutsStore(({ dragFrom, dragTo, list, active }) => {
		const st = list[active] ?? list.default;
		if (!dragFrom || !dragTo)
			return st; 
		return { ...st, items: { ...st.items, [dragFrom]: st.items[dragTo], [dragTo]: st.items[dragFrom] } };
	})
});