import { useRef, useState } from 'react';
import { clamp, useEventListener, useSize, type Size } from './util';
import { defaultLayouts, isPanelDraggable, allPanelOptions } from './events/events';
import { openContextMenu } from './app';
import { color } from './plots/plotUtil';
import { useLayoutsStore, useLayout, relinquishNode, LayoutContext, setNodeParams, gapSize, type LayoutsMenuDetails, splitNode, resetLayout } from './layout';
import { EventsContextMenu, LayoutContent } from './events/Events';
import { CatchErrors } from './Utility';

function Item({ id, size }: { id: string, size: Size }) {
	const { startDrag, dragOver, finishDrag } = useLayoutsStore.getState();
	const { items } = useLayout();
	if (!items[id]) relinquishNode(id);
	return items[id] && <div style={{ ...size, position: 'relative' }}
		onContextMenu={openContextMenu('layout', { nodeId: id })}
		onMouseDown={e => e.ctrlKey && isPanelDraggable(items[id]?.type) && startDrag(id)}
		onMouseEnter={() => dragOver(id)}
		onMouseUp={() => finishDrag()}>
		{<LayoutContext.Provider value={{ id, size, params: items[id]!, setParams: (k, para) => setNodeParams(id, k, para) }}>
			<CatchErrors>
				<LayoutContent/>
			</CatchErrors>
		</LayoutContext.Provider>}
		{!items[id]!.type && <div className='Center'><div className='ContextMenu' style={{ position: 'unset' }}>
			<CatchErrors>
				<LayoutContextMenu id={id}/>
			</CatchErrors>
		</div></div>}
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
		size: { ...size, [dim]: Math.round(size[dim] * ratio! - gapSize / 2) } };
	const propsB = { id: children![1],
		size: { ...size, [dim]: Math.round(size[dim] * (1 - ratio!) - gapSize / 2) } };

	return <div style={{ ...size, position: 'relative',
		display: 'flex', flexDirection: split, justifyContent: 'space-between' }}
	onMouseMove={e => {
		if (!drag.current) return;
		const delta = (isRow ? e.clientX : e.clientY) - drag.current.click;
		updateRatio(id, clamp(.05, .95, drag.current.ratio + delta / size[dim]));
	}}
	onMouseUp={() => { drag.current = null; }}
	onMouseLeave={() => { drag.current = null; }}>
		<Node {...propsA}/>
		<div style={{ ...size, [dim]: 12, position: 'absolute', zIndex: 2, userSelect: 'none',
			[isRow ? 'left' : 'top']: size[dim] * ratio! - 6,
			cursor: isRow ? 'col-resize' : 'row-resize' }}
		onContextMenu={openContextMenu('layout', { nodeId: id })}
		onMouseDown={e => { drag.current = { ratio, click: isRow ? e.clientX : e.clientY }; }}/>
		<Node {...propsB}/>
	</div>;
}

export function LayoutContextMenu({ id: argId, detail }: { id?: string, detail?: LayoutsMenuDetails }) {
	const { items, tree } = useLayout();
	const id = argId ?? detail?.nodeId;
	if (!id) return null;
	const parent = Object.keys(tree).find((node) => tree[node]?.children.includes(id));
	const isFirst = parent && tree[parent]?.children[0] === id;
	const relDir = parent && tree[parent]?.split === 'row' ? (isFirst ? 'right' : 'left') : (isFirst ? 'bottom' : 'top');
	const isFirstInRoot = isFirst && parent === 'root';
	const type = items[id]?.type;
	return <CatchErrors>
		{items[id] && !(items[id]!.type && isFirstInRoot) && <select style={{ borderColor: 'transparent', textAlign: 'left' }} value={type ?? 'empty'}
			onChange={e => setNodeParams(id, 'type', e.target.value as typeof allPanelOptions[number])}>
			{type == null && <option value={'empty'}>Select panel</option>}
			{allPanelOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
		</select>}
		{!isFirstInRoot && type && <div className='separator'/>}
		{type && <EventsContextMenu {...{ params: items[id]!, setParams: (key, para) => setNodeParams(id, key, para) }}/>}
		{items[id] && <div className='separator'/>}
		{!items[id] && <button onClick={() => splitNode(id, 'row', true)}>Split left</button>}
		{(!items[id] || type) && <button onClick={() => splitNode(id, 'row')}>Split right</button>}
		{!items[id] && <button onClick={() => splitNode(id, 'column', true)}>Split top</button>}
		{(!items[id] || type) && <button onClick={() => splitNode(id, 'column')}>Split bottom</button>}
		{items[id] && id !== 'root' && !(items[id]!.type && isFirstInRoot) && <button onClick={() => relinquishNode(id)}>Relinquish ({relDir})</button>}
	</CatchErrors>;
}

export function LayoutNav() {
	const { active, list, selectLayout, copyLayout, renameLayout, deleteLayout } = useLayoutsStore();
	const [hovered, setHovered] = useState<0 | 1 | 2>(0);
	const [renaming, setRenaming] = useState<{ layout: string, input: string } | null>(null);
	const [open, setOpen] = useState(false);
	const layouts = Object.keys(list);
	useEventListener('click', () => { setOpen(false); setRenaming(null); });
	useEventListener('contextmenu', () => { setOpen(false); setRenaming(null); });
	useEventListener('action+switchLayout', () => selectLayout(layouts[(layouts.indexOf(active) + 1) % layouts.length]));

	return <div style={{ padding: '2px 0 2px 4px', position: 'relative' }}
		onMouseEnter={() => setHovered(1)} onMouseLeave={() => setHovered(0)}>
		{open && <div className='ContextMenu' style={{ position: 'absolute', left: -1, bottom: 'calc(100%)' }}
			onClick={e => e.stopPropagation()}>
			{layouts.map(layout => {
				const isUsers = !defaultLayouts[layout], isActive = active === layout;
				return <div key={layout} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
					{renaming?.layout === layout ? <input type='text' style={{ width: renaming.input.length+1+'ch',
						maxWidth: '20em', height: '1.25em', flex: 1, color: color('text') }}
					autoFocus onFocus={e => e.target.select()}
					onKeyDown={e => ['Enter', 'NumpadEnter'].includes(e.code) && (e.target as any).blur?.()}
					onBlur={() => { renameLayout(renaming.layout, renaming.input); setRenaming(null); }}
					value={renaming.input} onChange={e => setRenaming({ ...renaming, input: e.target.value })}/> 
						: <span style={{ flex: 1, cursor: 'pointer', color:  isActive ? color('white') : isUsers ? color('text') : 'unset' }}
							onClick={() => selectLayout(layout)}>{layout}</span>}
					<div style={{ minWidth: 8 }}/>
					<button hidden={!isUsers} className='TextButton' onClick={() => setRenaming({ layout, input: layout })}>rename</button>
					<button className='TextButton' onClick={() => copyLayout(layout)}>copy</button>
					{isUsers ? <div className='CloseButton'
						onClick={() => deleteLayout(layout)}/> : <div style={{ minWidth: '1em' }}/>}
					
				</div>;})}
		</div>}
		<span style={{ cursor: 'pointer', color: open || hovered > 1 ? color('active') : 'unset', textDecoration: !open && hovered > 0 ? 'underline' : 'unset' }}
			onClick={e => {e.stopPropagation(); setOpen(o=>!o);}} onMouseEnter={() => setHovered(2)}
			onMouseLeave={() => setHovered(1)}>{open||hovered>0?'manage':'layout'}</span>:
		<select style={{ width: active.length+3+'ch' }} value={active} onChange={e => selectLayout(e.target.value)}>
			{Object.keys(list).map(la => <option key={la} value={la}>{la}</option>)}
		</select>
	</div>;
}

export default function AppLayout() {
	const startDrag = useLayoutsStore(st => st.startDrag);
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container);

	useEventListener('resetSettings', () => resetLayout());

	return <div id='layoutRoot' style={{ width: '100%', height: '100%' }} ref={setContainer}
		onMouseLeave={() => startDrag(null)} onMouseUp={() => startDrag(null)}>
		<Node {...{ size, id: 'root' }}/>
	</div>;
}