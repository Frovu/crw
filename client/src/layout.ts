import { createContext, type ComponentType } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { getApp, logMessage } from './app';
import type { Size } from './util';

export const gapSize = 2;

type LayoutTreeNode = {
	split: 'row' | 'column',
	ratio: number, 
	children: [string, string],
};

export type NodeParams<T> = { type: string | null } & T;
export type ParamsSetter<T> = (para: Partial<NodeParams<T>>) => void;

export type Layout<T> = {
	tree: { [key: string]: LayoutTreeNode | null },
	items: { [key: string]: NodeParams<T> | undefined }
};

type LayoutsState = {
	dragFrom: null | string,
	dragTo: null | string,
	appsDefaults: { [app: string]: { [name: string]: Layout<object> } },
	apps: {
		[app: string]: {
			active: string,
			list: { [name: string]: Layout<object> },
		}
	}
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
	appsDefaults: {},
	apps: {}
};

export type LayoutsMenuDetails = { nodeId: string };

export type ContextMenuProps<T> = { params: NodeParams<T>, setParams: ParamsSetter<T> };

export type AppLayoutProps<T> = {
	Content: ComponentType,
	ContextMenu: ComponentType<ContextMenuProps<T>>,
	defaultLayouts: { [name: string]: Layout<T> },
	panelOptions: readonly string[],
	duplicatablePanels?: readonly string[]
};

export type LayoutContextType<T> = { id: string, size: Size, params: NodeParams<T>, setParams: ParamsSetter<T> };
export const LayoutContext = createContext<LayoutContextType<object> | null>(null);

export const AppLayoutContext = createContext<AppLayoutProps<object>>({} as any);

export const useLayoutsStore = create<LayoutsState>()(
	persist(
		immer((set, get) => ({
			...defaultState,
			startDrag: nodeId => set(state =>
				state.dragFrom === nodeId ? state : ({ ...state, dragFrom: nodeId, dragTo: nodeId == null ? null : state.dragTo })),
			dragOver: nodeId => set(state => state.dragFrom ? ({ ...state, dragTo: nodeId }) : state),
			finishDrag: () => set(({ apps, dragFrom, dragTo }) => {
				const app = getApp();
				if (!dragFrom || !dragTo) return;
				const { list, active } = apps[app];
				const items = list[active].items;
				[items[dragFrom], items[dragTo]] = [items[dragTo], items[dragFrom]];
			}),
			updateRatio: (nodeId, ratio) => set(state => {
				const app = getApp();
				const { list, active } = state.apps[app];
				list[active].tree[nodeId]!.ratio = ratio;
			}),
			selectLayout: layout => set(({ apps }) => {
				const app = getApp();
				if (apps[app].list[layout])
					apps[app].active = layout;
			}),
			deleteLayout: layout => set(({ apps }) => {
				const app = getApp();
				logMessage('layout removed: ' + layout);
				delete apps[app].list[layout];
				if (apps[app].active === layout)
					apps[app].active = 'default';
			}),
			copyLayout: layout => set(({ apps }) => {
				const app = getApp();
				if (!apps[app].list[layout]) return;
				const { list } = apps[app];
				const name = (i: number) => layout+'(copy)'+(i||'');
				const copyName = name([...Array(Object.keys(list).length).keys()].find(i => !list[name(i)])!);
				list[copyName] = list[layout];
				apps[app].active = copyName;
			}),
			renameLayout: (layout, name) => set(({ apps }) => {
				const app = getApp();
				if (layout === name) return;
				const { list } = apps[app];
				list[name] = list[layout];
				delete list[layout];
				if (apps[app].active === layout)
					apps[app].active = name;
			}),
			resetLayout: () => set(({ apps, appsDefaults }) => {
				const app = getApp();
				const { list, active } = apps[app];
				if (!appsDefaults[app]?.[active])
					return;
				logMessage('layout reset: ' + active);
				list[active] = appsDefaults[app][active];
			}),
		})),
		{
			name: 'crwAppLayouts',
			partialize: ({ apps }) => ({ apps })
		}
	)
);

export const setNodeParams = <T>(nodeId: string, para: Partial<NodeParams<T>>) =>
	useLayoutsStore.setState(state => {
		const { list, active } = state.apps[getApp()];
		const items = list[active].items;
		if (!items[nodeId]) return state;
		items[nodeId] = Object.assign(items[nodeId]!, para);
	});

export const resetLayout = () => useLayoutsStore.setState(defaultState);

export const relinquishNode = (nodeId: string) => useLayoutsStore.setState(state => {
	const { list, active } = state.apps[getApp()];
	const { tree, items } = list[active];
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

export const splitNode = (nodeId: string, split: 'row'|'column', inverse: boolean, dupe: boolean) =>
	useLayoutsStore.setState(state => {
		const { list, active } = state.apps[getApp()];
		const { tree, items } = list[active];
		const [aId, bId] = ['A', 'B'].map(lt => lt + Date.now().toString());

		if (tree[nodeId])
			tree[aId] = tree[nodeId];
		tree[nodeId] = {
			split,
			ratio: .5,
			children: inverse ? [bId, aId] : [aId, bId] };
		if (items[nodeId])
			items[aId] = items[nodeId];
		items[bId] = dupe && items[nodeId] ? { ...items[nodeId]! } : { type: null };
		delete items[nodeId];
	});

export const useLayout = () => ({
	...useLayoutsStore(({ dragFrom, dragTo, apps }) => {
		const appLayouts = apps[getApp()];
		if (!appLayouts)
			return { tree: {}, items: {} };
		const { list, active } = appLayouts;
		const st = list[active] ?? list.default;
		if (!dragFrom || !dragTo)
			return st; 
		return { ...st, items: { ...st.items, [dragFrom]: st.items[dragTo], [dragTo]: st.items[dragFrom] } };
	})
});