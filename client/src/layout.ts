import { createContext, type ComponentType, type ReactElement } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { getApp, logMessage } from './app';
import type { Size } from './util';
import { defaultLayouts } from './defaultLayouts';
import type { CheckboxProps } from './components/Checkbox';
import type { LucideProps } from 'lucide-react';

export const gapSize = 2;

type LayoutTreeNode = {
	split: 'row' | 'column';
	ratio: number;
	children: [string, string];
};

export type NodeParams<T> = { type: string | null } & T;
export type ParamsSetter<T> = (para: Partial<NodeParams<T>>) => void;

export type Layout<T> = {
	ignoreWhenCycling?: boolean;
	tree: { [key: string]: LayoutTreeNode | null };
	items: { [key: string]: NodeParams<T> | undefined };
};

export type Panel<T> = {
	name: string;
	Panel: ComponentType;
	Menu?: ComponentType<ContextMenuProps<T>>;
	Icon?: ComponentType<LucideProps>;
	defaultParams?: T;
	isDuplicatable?: boolean;
};

export type LayoutsMenuDetails = { nodeId: string; window?: NodeParams<{}> };

export type ContextMenuProps<T> = {
	params: NodeParams<T>;
	setParams: ParamsSetter<T>;
	Checkbox: (props: { k: keyof T } & Omit<CheckboxProps, 'checked' | 'onCheckedChange'>) => ReactElement;
};

export type AppLayoutProps<T> = {
	panels: { [name: string]: Panel<T> };
};

export type LayoutContextType<T> = {
	id: string;
	size: Size;
	panel: Panel<{}>;
	isWindow?: boolean;
	params: NodeParams<T>;
	setParams: ParamsSetter<T>;
};
export const LayoutContext = createContext<LayoutContextType<{}> | null>(null);

export const AppLayoutContext = createContext<AppLayoutProps<{}>>({} as any);

type LayoutsState = {
	dragFrom: null | string;
	dragTo: null | string;
	apps: {
		[app: string]: {
			active: string;
			list: { [name: string]: Layout<{}> };
		};
	};
	windows: {
		[id: string]: {
			x: number;
			y: number;
			w: number;
			h: number;
			params: NodeParams<{}>;
			unique?: string;
		};
	};
	panels: {
		[app: string]: Panel<any>[];
	};
	updateRatio: (nodeId: string, ratio: number) => void;
	startDrag: (nodeId: string | null) => void;
	dragOver: (nodeId: string) => void;
	finishDrag: () => void;
	resetLayout: () => void;
	copyLayout: (la: string) => void;
	deleteLayout: (la: string) => void;
	selectLayout: (la: string) => void;
	renameLayout: (la: string, name: string) => void;
	toggleCycling: (la: string, val: boolean) => void;
};

const defaultState = {
	dragFrom: null,
	dragTo: null,
	apps: defaultLayouts,
	windows: {},
	panels: {},
};

export const useLayoutsStore = create<LayoutsState>()(
	persist(
		immer((set, get) => ({
			...defaultState,
			startDrag: (nodeId) =>
				set((state) =>
					state.dragFrom === nodeId
						? state
						: { ...state, dragFrom: nodeId, dragTo: nodeId == null ? null : state.dragTo }
				),
			dragOver: (nodeId) => set((state) => (state.dragFrom ? { ...state, dragTo: nodeId } : state)),
			finishDrag: () =>
				set(({ apps, dragFrom, dragTo }) => {
					const app = getApp();
					if (!dragFrom || !dragTo) return;
					const { list, active } = apps[app];
					const items = list[active].items;
					[items[dragFrom], items[dragTo]] = [items[dragTo], items[dragFrom]];
				}),
			updateRatio: (nodeId, ratio) =>
				set((state) => {
					const app = getApp();
					const { list, active } = state.apps[app];
					list[active].tree[nodeId]!.ratio = ratio;
				}),
			selectLayout: (layout) =>
				set(({ apps, ...st }) => {
					st.windows = {};
					const app = getApp();
					if (apps[app].list[layout]) apps[app].active = layout;
				}),
			deleteLayout: (layout) =>
				set(({ apps }) => {
					const app = getApp();
					logMessage('layout removed: ' + layout);
					delete apps[app].list[layout];
					if (apps[app].active === layout)
						apps[app].active = defaultLayouts[app as keyof typeof defaultLayouts].active;
				}),
			copyLayout: (layout) =>
				set(({ apps }) => {
					const app = getApp();
					if (!apps[app].list[layout]) return;
					const { list } = apps[app];
					const name = (i: number) => layout + '(copy)' + (i || '');
					const copyName = name([...Array(Object.keys(list).length).keys()].find((i) => !list[name(i)])!);
					list[copyName] = list[layout];
					apps[app].active = copyName;
				}),
			renameLayout: (layout, name) =>
				set(({ apps }) => {
					const app = getApp();
					if (layout === name) return;
					const { list } = apps[app];
					list[name] = list[layout];
					delete list[layout];
					if (apps[app].active === layout) apps[app].active = name;
				}),
			resetLayout: () =>
				set(({ apps, ...st }) => {
					st.windows = {};
					const app = getApp() as keyof typeof defaultLayouts;
					const { list, active } = apps[app];
					if (!defaultLayouts[app].list[active]) return;
					logMessage('layout reset: ' + active);
					list[active] = defaultLayouts[app].list[active];
				}),
			toggleCycling: (layout, value) =>
				set(({ apps }) => {
					const { list } = apps[getApp()];
					list[layout].ignoreWhenCycling = value;
				}),
		})),
		{
			name: 'crwAppLayouts2',
			partialize: ({ apps }) => ({ apps }),
		}
	)
);

export const setNodeParams = <T>(nodeId: string, para: Partial<NodeParams<T>>) =>
	useLayoutsStore.setState((state) => {
		const { list, active } = state.apps[getApp()];
		const items = list[active].items;
		if (!items[nodeId]) return state;
		items[nodeId] = Object.assign(items[nodeId]!, para);
	});

export const resetLayoutsState = () => useLayoutsStore.setState((st) => ({ ...defaultState, panels: st.panels }));

export const setWindowParams = <T>(id: string, para: Partial<NodeParams<T>>) =>
	useLayoutsStore.setState(({ windows }) => {
		if (windows[id]) windows[id].params = Object.assign(windows[id].params, para);
	});

export const openWindow = (para: LayoutsState['windows'][string]) =>
	useLayoutsStore.setState(({ windows }) => {
		if (para.unique) {
			const old = Object.keys(windows).find((w) => windows[w].unique === para.unique);
			if (old) {
				windows[old] = { ...para, params: { ...windows[old].params, ...para.params } };
				return;
			}
		}
		const id = Date.now().toString() + para.params.type;
		windows[id] = para;
	});

export const closeWindow = (id: string) =>
	useLayoutsStore.setState((state) => {
		delete state.windows[id];
	});

export const moveWindow = (id: string, move: { x?: number; y?: number; w?: number; h?: number }) =>
	useLayoutsStore.setState(({ windows }) => {
		if (windows[id]) windows[id] = Object.assign(windows[id], move);
	});

export const relinquishNode = (nodeId: string) =>
	useLayoutsStore.setState((state) => {
		const { list, active } = state.apps[getApp()];
		const { tree, items } = list[active];
		const parent = Object.keys(tree).find((node) => tree[node]?.children.includes(nodeId));
		if (!parent) return state;
		const otherNodeId = tree[parent]!.children.filter((ch) => ch !== nodeId)[0];
		if (items[otherNodeId]) items[parent] = items[otherNodeId];
		tree[parent] = tree[otherNodeId];
		delete tree[otherNodeId];
		delete items[nodeId];
		delete items[otherNodeId];
	});

export const splitNode = (nodeId: string, split: 'row' | 'column', inverse: boolean, dupe: boolean) =>
	useLayoutsStore.setState((state) => {
		const { list, active } = state.apps[getApp()];
		const { tree, items } = list[active];
		const [aId, bId] = ['A', 'B'].map((lt) => lt + Date.now().toString());

		if (tree[nodeId]) tree[aId] = tree[nodeId];
		tree[nodeId] = {
			split,
			ratio: 0.5,
			children: inverse ? [bId, aId] : [aId, bId],
		};
		if (items[nodeId]) items[aId] = items[nodeId];
		items[bId] = dupe && items[nodeId] ? { ...items[nodeId]! } : { type: null };
		delete items[nodeId];
	});

export const useLayout = () => ({
	...useLayoutsStore(({ dragFrom, dragTo, apps }) => {
		const appLayouts = apps[getApp()];
		if (!appLayouts) return { tree: {}, items: {} };
		const { list, active } = appLayouts;
		const st = list[active] ?? list.default;
		if (!dragFrom || !dragTo) return st;
		return { ...st, items: { ...st.items, [dragFrom]: st.items[dragTo], [dragTo]: st.items[dragFrom] } };
	}),
});

export const useNodeExists = (type: string) => {
	const layouts = useLayoutsStore((state) => state.apps[getApp()]);
	if (!layouts) return false;
	const { list, active } = layouts;
	const st = list[active] ?? list.default;
	return !!Object.values(st.items).find((p) => p?.type === type);
};
