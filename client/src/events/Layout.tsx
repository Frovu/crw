import { useRef, useState } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import { clamp, useSize } from '../util';
import { LayoutContent } from './EventsApp';

export type Size = { width: number, height: number };

export type LayoutItemParams = {
	color: string
};

type LayoutTreeNode = {
	split: 'row' | 'column',
	ratio: number, 
	children: [string, string],
};

type Layout = {
	tree: { [key: string]: LayoutTreeNode | null },
	items: { [key: string]: LayoutItemParams }
};

type LayoutsState = {
	dragFrom: null | string,
	dragTo: null | string,
	active: string,
	list: { [name: string]: Layout },
	updateRatio: (nodeId: string, ratio: number) => void,
	startDrag: (nodeId: string | null) => void,
	dragOver: (nodeId: string) => void,
	finishDrag: (nodeId: string) => void,
}; 

export const useLayoutsStore = create<LayoutsState>()(
	// persist(
	immer((set, get) => ({
		dragFrom: null, // FIXME: don't persist this
		dragTo: null,
		active: 'default',
		list: {
			default: {
				tree: {
					root: {
						split: 'column',
						ratio: .3,
						children: ['l', 'rig']
					},
					rig: {
						split: 'row',
						ratio: .5,
						children: ['r', 't']
					}
				},
				items: {
					l: { color: 'blue' },
					r: { color: 'orange' },
					t: { color: 'green' }
				}
			}
		},
		startDrag: (nodeId: string | null) => set(state => ({ ...state, dragFrom: nodeId, dragTo: nodeId == null ? null : state.dragTo })),
		dragOver: (nodeId: string) => set(state => state.dragFrom ? ({ ...state, dragTo: nodeId }) : state),
		finishDrag: (nodeId: string) => set(({ list, active, dragFrom, dragTo }) => {
			if (!dragFrom || !dragTo) return;
			const items = list[active].items;
			[items[dragFrom], items[dragTo]] = [items[dragTo], items[dragFrom]];
		}),
		updateRatio: (nodeId: string, ratio: number) =>
			set(state => { state.list[state.active].tree[nodeId]!.ratio = ratio; })
	}))
	// , { name: 'eventsAppLayouts' })
);

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
		onMouseDown={() => startDrag(id)}
		onMouseEnter={() => dragOver(id)}
		onMouseUp={() => finishDrag(id)}>
		<LayoutContent {...{ params: items[id], size }}/>
	</div>;
}

function Node({ id, size }: { id: string, size: Size }) {
	const drag = useRef<{ ratio: number, click: number } | null>(null);
	const { updateRatio } = useLayoutsStore();
	const { tree } = useLayout();
	const { split, children, ratio } = tree[id]!;

	const isRow = split === 'row';
	const dim = isRow ? 'width' : 'height';
	const propsA = { id: children![0],
		size: { ...size, [dim]: size[dim] * ratio! - 2 } };
	const propsB = { id: children![1],
		size: { ...size, [dim]: size[dim] * (1 - ratio!) - 2 } };

	return <div style={{ ...size, position: 'relative',
		display: 'flex', flexDirection: split, justifyContent: 'space-between' }}
	onMouseMove={e => {
		if (!drag.current) return;
		const delta = (isRow ? e.clientX : e.clientY) - drag.current.click;
		updateRatio(id, clamp(.1, .9, drag.current.ratio + delta / size[dim]));
	}}
	onMouseUp={() => { drag.current = null; }}
	onMouseLeave={() => { drag.current = null; }}>
		{tree[propsA.id] ? <Node {...propsA}/> : <Item {...propsA}/>}
		<div style={{ ...size, [dim]: 12, position: 'absolute', userSelect: 'none',
			[isRow ? 'left' : 'top']: size[dim] * ratio! - 6,
			cursor: isRow ? 'col-resize' : 'row-resize' }}
		onMouseDown={e => { drag.current = { ratio, click: isRow ? e.clientX : e.clientY }; }}/>
		{tree[propsB.id] ? <Node {...propsB}/> : <Item {...propsB}/>}
	</div>;
}

export default function AppLayout() {
	const { startDrag } = useLayoutsStore();
	const [container, setContainer] = useState<HTMLDivElement>();
	const size = useSize(container);
	return <div style={{ width: '100%', height: '100%' }} ref={el => setContainer(el!)}
		onMouseLeave={() => startDrag(null)} onMouseUp={() => startDrag(null)}>
		<Node {...{ size, id: 'root' }}/>
	</div>;
}