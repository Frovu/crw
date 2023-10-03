import '../styles/ContextMenu.css';
import React, { useRef, useState } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import { clamp, useEventListener, useSize, Size } from '../util';
import { ContextMenuContent, LayoutContent } from './EventsApp';
import { PanelParams, defaultLayouts, isPanelDraggable, isPanelDuplicatable, panelOptions } from './events';

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
	contextMenu: { x: number, y: number, id: string } | null,
	dragFrom: null | string,
	dragTo: null | string,
	active: string,
	list: { [name: string]: Layout },
	openContextMenu: (x: number, y: number, id: string) => void,
	closeContextMenu: () => void,
	updateRatio: (nodeId: string, ratio: number) => void,
	startDrag: (nodeId: string | null) => void,
	dragOver: (nodeId: string) => void,
	finishDrag: (nodeId: string) => void,
}; 

const defaultState = {
	contextMenu: null,
	dragFrom: null, // FIXME: don't persist this
	dragTo: null,
	active: 'default',
	list: defaultLayouts,
};

export const useLayoutsStore = create<LayoutsState>()(
	persist(
		immer((set, get) => ({
			...defaultState,
			closeContextMenu: () => set(state => ({ ...state, contextMenu: null })),
			openContextMenu: (x, y, id) => set(state => ({ ...state, contextMenu: state.contextMenu ? null : { x, y, id } })),
			startDrag: (nodeId: string | null) => set(state => ({ ...state, dragFrom: nodeId, dragTo: nodeId == null ? null : state.dragTo })),
			dragOver: (nodeId: string) => set(state => state.dragFrom ? ({ ...state, dragTo: nodeId }) : state),
			finishDrag: (nodeId: string) => set(({ list, active, dragFrom, dragTo }) => {
				if (!dragFrom || !dragTo) return;
				const items = list[active].items;
				[items[dragFrom], items[dragTo]] = [items[dragTo], items[dragFrom]];
			}),
			updateRatio: (nodeId: string, ratio: number) =>
				set(state => { state.list[state.active].tree[nodeId]!.ratio = ratio; })
		})),
		{ 
			name: 'eventsAppLayouts',
			partialize: ({ active, list }) => ({ active, list })
		}
	)
);

export const resetLayouts = () => useLayoutsStore.setState(defaultState);

const setParams = (nodeId: string, para: Partial<PanelParams>)  => useLayoutsStore.setState(state => {
	const { items } = state.list[state.active];
	Object.assign(items[nodeId], para);
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
	const { startDrag, dragOver, finishDrag, openContextMenu } = useLayoutsStore();
	const { items } = useLayout();
	return <div style={{ ...size, position: 'relative' }}
		onContextMenu={e => {
			e.preventDefault();
			e.stopPropagation();
			openContextMenu(e.clientX, e.clientY, id);
		}}
		onMouseDown={() => isPanelDraggable(items[id].type!) && startDrag(id)}
		onMouseEnter={() => dragOver(id)}
		onMouseUp={() => finishDrag(id)}>
		{items[id]?.type ? <LayoutContent {...{ size, params: items[id] }}/> : <div className='Center'><ContextMenu id={id}/></div>}
	</div>;
}

function Node({ id, size }: { id: string, size: Size }) {
	const drag = useRef<{ ratio: number, click: number } | null>(null);
	const { updateRatio } = useLayoutsStore();
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
		<div style={{ ...size, [dim]: 12, position: 'absolute', userSelect: 'none',
			[isRow ? 'left' : 'top']: size[dim] * ratio! - 6,
			cursor: isRow ? 'col-resize' : 'row-resize' }}
		onMouseDown={e => { drag.current = { ratio, click: isRow ? e.clientX : e.clientY }; }}/>
		<Node {...propsB}/>
	</div>;
}

function ContextMenu({ id }: { id: string }) {
	const { items, tree } = useLayout();
	if (!items[id]) return null;
	const parentNode = Object.values(tree).find((node) => node?.children.includes(id));
	const isFirst = parentNode?.children[0] === id;
	const relDir = parentNode?.split === 'row' ? (isFirst ? 'right' : 'left') : (isFirst ? 'bottom' : 'top');
	const type = items[id]?.type;
	return <div className='ContextMenu'
		onClick={e => !(e.target instanceof HTMLButtonElement) && e.stopPropagation()}>
		<select style={{ borderColor: 'transparent', textAlign: 'left' }} value={type ?? 'empty'} onChange={e => setParams(id, { type: e.target.value as any })}>
			{type == null && <option value={'empty'}>Select panel</option>}
			{panelOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
		</select>
		{type && <div style={{ backgroundColor: 'var(--color-text-dark)', height: 1 }}></div>}
		{type && <ContextMenuContent {...{ params: items[id], setParams: (para) => setParams(id, para) }}/>}
		<div style={{ backgroundColor: 'var(--color-text-dark)', height: 1 }}></div>
		{type && <button onClick={() => splitNode(id, 'row')}>Split right</button>}
		{type && <button onClick={() => splitNode(id, 'column')}>Split bottom</button>}
		{id !== 'root' && <button onClick={() => relinquishNode(id)}>Relinquish ({relDir})</button>}
	</div>;
}

export default function AppLayout() {
	const { startDrag, contextMenu } = useLayoutsStore();
	const [container, setContainer] = useState<HTMLDivElement>();
	const size = useSize(container);

	useEventListener('resetSettings', resetLayouts);

	return <div style={{ width: '100%', height: '100%' }} ref={el => setContainer(el!)}
		onMouseLeave={() => startDrag(null)} onMouseUp={() => startDrag(null)}>
		<Node {...{ size, id: 'root' }}/>
		{contextMenu && <div style={{ position: 'fixed', transform: contextMenu.y > size.height / 2 ? 'translateY(-100%)' : 'unset',
			left: Math.min(contextMenu.x, size.width - 200), top: contextMenu.y }}>
			<ContextMenu id={contextMenu.id}/>
		</div>}
	</div>;
}