import { createContext } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { getApp, logMessage } from './app';
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
	apps: {
		[app: string]: {
			active: string,
			list: { [name: string]: Layout },
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
	apps: {
		feid: {
			active: 'default',
			list: defaultLayouts,

		}
	}
};

export type LayoutsMenuDetails = { nodeId: string };

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
			resetLayout: () => set(({ apps }) => {
				const app = getApp();
				if (!(defaultState as any).apps[app].list[apps[app].active])
					return;
				const { list, active } = apps[app];
				logMessage('layout reset: ' + active);
				list[active] = (defaultState as any).apps[app].list[active];
			}),
		})),
		{
			name: 'crwAppLayouts',
			partialize: ({ apps }) => ({ apps })
		}
	)
);

export type ParamsSetter = <T extends keyof PanelParams>(k: T, para: Partial<PanelParams[T]>) => void;
export const LayoutContext = createContext<{ id: string, size: Size, params: PanelParams, setParams: ParamsSetter } | null>(null);

export const setNodeParams = <T extends keyof PanelParams>(nodeId: string, k: T, para: Partial<PanelParams[T]>) =>
	useLayoutsStore.setState(state => {
		const { list, active } = state.apps[getApp()];
		const { items } = list[active];
		items[nodeId]![k] = typeof items[nodeId]![k] == 'object' ? Object.assign(items[nodeId]![k] as any, para) : para;
	});

export const setStatColumn = (col: ColumnDef, i: number) => {
	const { list, active } = useLayoutsStore.getState().apps[getApp()];
	const layout = list[active];
	const key = (['column0', 'column1'] as const)[i];
	for (const [id, item] of Object.entries(layout.items))
		if (statPanelOptions.includes(item?.type as any))
			setNodeParams(id, 'statParams', { [key]:
		item?.type === 'Histogram' && item?.statParams?.[key] === col.id ? null : col.id });
};

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

export const splitNode = (nodeId: string, split: 'row'|'column', inverse?: boolean) => useLayoutsStore.setState(state => {
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
	items[bId] = isPanelDuplicatable(items[nodeId]?.type) ? { ...items[nodeId] } : {};
	delete items[nodeId];
});

export const useLayout = () => ({
	...useLayoutsStore(({ dragFrom, dragTo, apps }) => {
		const { list, active } = apps[getApp()];
		const st = list[active] ?? list.default;
		if (!dragFrom || !dragTo)
			return st; 
		return { ...st, items: { ...st.items, [dragFrom]: st.items[dragTo], [dragTo]: st.items[dragFrom] } };
	})
});