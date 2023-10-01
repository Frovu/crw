import { useRef, useState } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist } from 'zustand/middleware';
import { clamp, useEventListener, useSize } from '../util';
import { LayoutItem } from './EventsApp';

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
	active: string,
	list: { [name: string]: Layout },
	updateRatio: (nodeId: string, ratio: number) => void
};

export const useLayoutsStore = create<LayoutsState>()(
	// persist(
	immer((set, get) => ({
		active: 'default',
		list: {
			default: {
				tree: {
					root: {
						split: 'row',
						ratio: .3,
						children: ['l', 'rig']
					},
					rig: {
						split: 'column',
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
		updateRatio: (nodeId: string, ratio: number) =>
			set(state => { state.list[state.active].tree[nodeId]!.ratio = ratio; })
	}))
	// , { name: 'eventsAppLayouts' })
);

const useLayout = () => ({
	...useLayoutsStore(state => state.list[state.active]),
	updateRatio: useLayoutsStore(st => st.updateRatio)
});

function Node({ id, size }: { id: string, size: Size }) {
	const drag = useRef<{ ratio: number, click: number } | null>(null);
	const { tree, items, updateRatio } = useLayout();
	const { split, children, ratio } = tree[id]!;

	useEventListener('mousemove', (e: MouseEvent) => {
		if (!drag.current) return;
		const delta = (isRow ? e.clientX : e.clientY) - drag.current.click;
		updateRatio(id, clamp(.1, .9, drag.current.ratio + delta / size[dim]));
	});
	useEventListener('mouseup', (e: MouseEvent) => {
		drag.current = null;
	});

	const isRow = split === 'row';
	const dim = isRow ? 'width' : 'height';
	const propsA = { id: children![0],
		size: { ...size, [dim]: size[dim] * ratio! - 2 } };
	const propsB = { id: children![1],
		size: { ...size, [dim]: size[dim] * (1 - ratio!) - 2 } };

	return <div style={{ ...size, position: 'relative',
		display: 'flex', flexDirection: split, justifyContent: 'space-between' }}>
		{tree[propsA.id] ? <Node {...propsA}/> : <LayoutItem {...{ params: items[propsA.id], size: propsA.size }}/>}
		<div style={{ ...size, [dim]: 12, position: 'absolute', userSelect: 'none',
			[isRow ? 'left' : 'top']: size[dim] * ratio! - 6,
			cursor: isRow ? 'col-resize' : 'row-resize' }}
		onMouseDown={e => { drag.current = { ratio, click: isRow ? e.clientX : e.clientY }; }}/>
		{tree[propsB.id] ? <Node {...propsB}/> : <LayoutItem {...{ params: items[propsB.id], size: propsB.size }}/>}
	</div>;
}

export default function AppLayout() {
	const [container, setContainer] = useState<HTMLDivElement>();
	const size = useSize(container);
	return <div style={{ width: '100%', height: '100%' }} ref={el => setContainer(el!)}>
		<Node {...{ size, id: 'root' }}/>
	</div>;
}