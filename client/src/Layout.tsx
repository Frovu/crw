import React, { createContext, useRef, useState } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import { clamp, useEventListener, useSize, Size } from './util';
import { ContextMenuContent, LayoutContent } from './events/EventsApp';
import { PanelParams, defaultLayouts, isPanelDraggable, isPanelDuplicatable, allPanelOptions } from './events/events';
import { openContextMenu, useContextMenu } from './app';

type LayoutTreeNode = {
	split: 'row' | 'column',
	ratio: number, 
	children: [string, string],
};

export type Layout = {
	tree: { [key: string]: LayoutTreeNode | null },
	items: { [key: string]: PanelParams }
};

type LayoutsState = {
	dragFrom: null | string,
	dragTo: null | string,
	active: string,
	list: { [name: string]: Layout },
	selectLayout: (la: string) => void,
	updateRatio: (nodeId: string, ratio: number) => void,
	startDrag: (nodeId: string | null) => void,
	dragOver: (nodeId: string) => void,
	finishDrag: (nodeId: string) => void,
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
			selectLayout: layout => set(state => { if (state.list[layout]) state.active = layout; }),
			startDrag: nodeId => set(state =>
				state.dragFrom === nodeId ? state : ({ ...state, dragFrom: nodeId, dragTo: nodeId == null ? null : state.dragTo })),
			dragOver: nodeId => set(state => state.dragFrom ? ({ ...state, dragTo: nodeId }) : state),
			finishDrag: nodeId => set(({ list, active, dragFrom, dragTo }) => {
				if (!dragFrom || !dragTo) return;
				const items = list[active].items;
				[items[dragFrom], items[dragTo]] = [items[dragTo], items[dragFrom]];
			}),
			updateRatio: (nodeId, ratio) =>
				set(state => { state.list[state.active].tree[nodeId]!.ratio = ratio; })
		})),
		{
			name: 'eventsAppLayouts',
			partialize: ({ active, list }) => ({ active, list })
		}
	)
);

export type ParamsSetter = <T extends keyof PanelParams>(k: T, para: Partial<PanelParams[T]>) => void;
export const LayoutContext = createContext<{ id: string, size: Size, params: PanelParams, setParams: ParamsSetter } | null>(null);

export const resetLayout = () => useLayoutsStore.setState(({ list, active }) => {
	if (defaultState.list[active]) list[active] = defaultState.list[active]; });

const setParams = <T extends keyof PanelParams>(nodeId: string, k: T, para: Partial<PanelParams[T]>) => useLayoutsStore.setState(state => {
	const { items } = state.list[state.active];
	items[nodeId][k] = typeof items[nodeId][k] == 'object' ? Object.assign(items[nodeId][k] as any, para) : para;
});

const relinquishNode = (nodeId: string) => useLayoutsStore.setState(state => {
	const { tree, items } = state.list[state.active];
	const parent = Object.keys(tree).find(node => tree[node]?.children.includes(nodeId));
	if (!parent) return state;
	const otherNodeId = tree[parent]!.children.filter(ch => ch !== nodeId)[0];
	items[parent] = items[otherNodeId];
	tree[parent] = tree[otherNodeId];
	delete tree[otherNodeId];
	delete items[nodeId];
	delete items[otherNodeId];
});

const splitNode = (nodeId: string, split: 'row'|'column') => useLayoutsStore.setState(state => {
	const { tree, items } = state.list[state.active];
	const [aId, bId] = ['A', 'B'].map(lt => lt + Date.now().toString()); // meh

	tree[nodeId] = {
		split,
		ratio: .5,
		children: [aId, bId]
	};
	items[aId] = items[nodeId];
	items[bId] = isPanelDuplicatable(items[nodeId].type!) ? { ...items[nodeId] } : {};
	delete items[nodeId];
});

const useLayout = () => ({
	...useLayoutsStore(({ dragFrom, dragTo, list, active }) => {
		const st = list[active];
		if (!dragFrom || !dragTo)
			return st;
		return { ...st, items: { ...st.items, [dragFrom]: st.items[dragTo], [dragTo]: st.items[dragFrom] } };
	})
});

function Item({ id, size }: { id: string, size: Size }) {
	const { startDrag, dragOver, finishDrag } = useLayoutsStore();
	const { items } = useLayout();
	return <div style={{ ...size, position: 'relative' }}
		onContextMenu={openContextMenu('layout', { nodeId: id })}
		onMouseDown={() => isPanelDraggable(items[id].type!) && startDrag(id)}
		onMouseEnter={() => dragOver(id)}
		onMouseUp={() => finishDrag(id)}>
		{<LayoutContext.Provider value={{ id, size, params: items[id], setParams: (k, para) => setParams(id, k, para) }}>
			<LayoutContent/></LayoutContext.Provider>}
		{!items[id]?.type && <div className='Center'><div className='ContextMenu' style={{ position: 'unset' }}>
			<LayoutContextMenu id={id}/></div></div>}
	</div>;
}

function Node({ id, size }: { id: string, size: Size }) {
	const drag = useRef<{ ratio: number, click: number } | null>(null);
	const updateRatio = useLayoutsStore(st => st.updateRatio);
	const { tree } = useLayout();

	if (tree[id] == null)
		return <Item {...{ id, size }}/>;

	const { split, children, ratio } = tree[id]!;

	const isRow = split === 'row';
	const dim = isRow ? 'width' : 'height';
	const propsA = { id: children![0],
		size: { ...size, [dim]: size[dim] * ratio! - 1 } };
	const propsB = { id: children![1],
		size: { ...size, [dim]: size[dim] * (1 - ratio!) - 1 } };

	return <div style={{ ...size, position: 'relative',
		display: 'flex', flexDirection: split, justifyContent: 'space-between' }}
	onMouseMove={e => {
		if (!drag.current) return;
		const delta = (isRow ? e.clientX : e.clientY) - drag.current.click;
		updateRatio(id, clamp(.1, .9, drag.current.ratio + delta / size[dim]));
	}}
	onMouseUp={() => { drag.current = null; }}
	onMouseLeave={() => { drag.current = null; }}>
		<Node {...propsA}/>
		<div style={{ ...size, [dim]: 12, position: 'absolute', zIndex: 2, userSelect: 'none',
			[isRow ? 'left' : 'top']: size[dim] * ratio! - 6,
			cursor: isRow ? 'col-resize' : 'row-resize' }}
		onMouseDown={e => { drag.current = { ratio, click: isRow ? e.clientX : e.clientY }; }}/>
		<Node {...propsB}/>
	</div>;
}

export function LayoutContextMenu({ id: argId }: { id?: string }) {
	const { items, tree } = useLayout();
	const id = useContextMenu(state => argId ?? state.menu?.detail?.nodeId);
	if (!id || !items[id]) return null;
	const parent = Object.keys(tree).find((node) => tree[node]?.children.includes(id));
	const isFirst = parent && tree[parent]?.children[0] === id;
	const relDir = parent && tree[parent]?.split === 'row' ? (isFirst ? 'right' : 'left') : (isFirst ? 'bottom' : 'top');
	const isFirstInRoot = isFirst && parent === 'root';
	const type = items[id]?.type;
	return <>
		{!isFirstInRoot && <select style={{ borderColor: 'transparent', textAlign: 'left' }} value={type ?? 'empty'}
			onChange={e => setParams(id, 'type', e.target.value as any)}>
			{type == null && <option value={'empty'}>Select panel</option>}
			{allPanelOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
		</select>}
		{!isFirstInRoot && type && <div className='separator'/>}
		{type && <ContextMenuContent {...{ params: items[id], setParams: (key, para) => setParams(id, key, para) }}/>}
		<div className='separator'/>
		{type && <button onClick={() => splitNode(id, 'row')}>Split right</button>}
		{type && <button onClick={() => splitNode(id, 'column')}>Split bottom</button>}
		{id !== 'root' && !isFirstInRoot && <button onClick={() => relinquishNode(id)}>Relinquish ({relDir})</button>}
	</>;
}

export function LayoutNav() {
	const { active, list, selectLayout } = useLayoutsStore();
	return <div style={{ padding: '2px 0 2px 4px' }}>
		layout:<select value={active} onChange={e => selectLayout(e.target.value)}>
			{Object.keys(list).map(la => <option key={la} value={la}>{la}</option>)}
		</select>
	</div>;
}

export default function AppLayout() {
	const startDrag = useLayoutsStore(st => st.startDrag);
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container);

	useEventListener('resetSettings', () => useLayoutsStore.setState(defaultState));

	return <div id='layoutRoot' style={{ width: '100%', height: '100%' }} ref={setContainer}
		onMouseLeave={() => startDrag(null)} onMouseUp={() => startDrag(null)}>
		<Node {...{ size, id: 'root' }}/>
	</div>;
}