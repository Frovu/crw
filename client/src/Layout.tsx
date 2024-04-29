import { useRef, useState, useContext, useEffect } from 'react';
import { clamp, useEventListener, useSize, type Size } from './util';
import { color, getApp, openContextMenu } from './app';
import { useLayoutsStore, useLayout, relinquishNode, LayoutContext, setNodeParams,
	gapSize, type LayoutsMenuDetails, splitNode, resetLayout, AppLayoutContext, type AppLayoutProps, 
	setWindowParams, closeWindow, moveWindow } from './layout';
import { CatchErrors } from './Utility';
import ContextMenu from './ContextMenu';

function Window({ id }: { id: string}) {
	const { Content, panelOptions } = useContext(AppLayoutContext);
	const { params, ...pos } = useLayoutsStore(st => st.windows[id]) ?? {};
	const size = { height: pos.h, width: pos.w };

	const drag = useRef<null | { pos: typeof pos, x: number, y: number, resize?: string }>(null);

	if (!params || !panelOptions.includes(params.type as any))
		relinquishNode(id);

	useEventListener('mousemove', e => {
		if (!drag.current) return;
		const { pos: { x, y, w, h }, x: sx, y: sy, resize } = drag.current;
		const cx = e.clientX, cy = e.clientY;
		if (!resize)
			return moveWindow(id, {
				x: x + cx - sx,
				y: y + cy - sy,
			});
		if (resize === 'nw')
			return moveWindow(id, {
				x: x + cx - sx,
				y: y + cy - sy,
				w: w + sx - cx,
				h: h + sy - cy,
			});
		if (resize === 'sw')
			return moveWindow(id, {
				x: x + cx - sx,
				w: w + sx - cx,
				h: h + cy - sy,
			});
		if (resize === 'se')
			return moveWindow(id, {
				w: w + cx - sx,
				h: h + cy - sy,
			});
	});

	useEventListener('mouseup', () => {
		drag.current = null;
	});

	return <div style={{ position: 'fixed', zIndex: 3, left: pos.x, top: pos.y, width: pos.w, height: pos.h,
		backgroundColor: color('bg'), padding: 1, border: '1px solid '+color('border') }}
	onDoubleClick={() => closeWindow(id)}
	onMouseDown={e => { drag.current = { pos, x: e.clientX, y: e.clientY }; }}
	onContextMenu={openContextMenu('layout', { nodeId: id, window: { ...params } })}>
		<LayoutContext.Provider value={{ id, size, params,
			setParams: (para) => setWindowParams(id, para) }}>
			<CatchErrors>
				<Content/>
			</CatchErrors>
		</LayoutContext.Provider>
		<div className='CloseButton' style={{ position: 'absolute', top: -1, right: -1,
			background: color('bg'), border: '1px solid '+color('border'), lineHeight: '14px' }}
		onClick={() => closeWindow(id)}/>
		<div style={{ position: 'absolute', cursor: 'nw-resize', zIndex: 4, top: -4, left: -4, width: 16, height: 16 }}
			onMouseDown={e => { drag.current = { pos, x: e.clientX, y: e.clientY, resize: 'nw' }; e.stopPropagation(); }}/>
		<div style={{ position: 'absolute', cursor: 'sw-resize', zIndex: 4, bottom: -4, left: -4, width: 16, height: 16 }}
			onMouseDown={e => { drag.current = { pos, x: e.clientX, y: e.clientY, resize: 'sw' }; e.stopPropagation(); }}/>
		<div style={{ position: 'absolute', cursor: 'se-resize', zIndex: 4, bottom: -4, right: -4, width: 16, height: 16 }}
			onMouseDown={e => { drag.current = { pos, x: e.clientX, y: e.clientY, resize: 'se' }; e.stopPropagation(); }}/>
	</div>;
};

function Item({ id, size }: { id: string, size: Size }) {
	const { Content, panelOptions } = useContext(AppLayoutContext);
	const { startDrag, dragOver, finishDrag } = useLayoutsStore.getState();
	const { items } = useLayout();
	if (!items[id] || (items[id]!.type != null && !panelOptions.includes(items[id]!.type as any)))
		relinquishNode(id);

	return items[id] && <div style={{ ...size, position: 'relative' }}
		onContextMenu={openContextMenu('layout', { nodeId: id })}
		onMouseDown={e => e.ctrlKey && startDrag(id)}
		onMouseEnter={() => dragOver(id)}
		onMouseUp={() => finishDrag()}>
		{<LayoutContext.Provider value={{ id, size, params: items[id]!,
			setParams: (para) => setNodeParams(id, para) }}>
			<CatchErrors>
				<Content/>
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
	const otherDim = isRow ? 'height' : 'width';
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
		onMouseDown={e => {
			if (e.ctrlKey)
				return updateRatio(id, clamp(.05, .95, (size[otherDim] + gapSize / 2) / size[dim]));
			drag.current = { ratio, click: isRow ? e.clientX : e.clientY };
		}}/>
		<Node {...propsB}/>
	</div>;
}

export function LayoutContextMenu({ id: argId, detail }: { id?: string, detail?: LayoutsMenuDetails }) {
	const { ContextMenu: Content, panelOptions, duplicatablePanels } = useContext(AppLayoutContext);
	const { items, tree } = useLayout();
	const windows  = useLayoutsStore(st => st.windows);
	const id = argId ?? detail?.nodeId;
	const window = detail?.window;
	if (window)
		return <CatchErrors>
			<Content {...{ params: windows[id!].params, setParams: (para) => setWindowParams(id!, para) }}/>
		</CatchErrors>;
	if (!id) return null;
	const parent = Object.keys(tree).find((node) => tree[node]?.children.includes(id));
	const isFirst = parent && tree[parent]?.children[0] === id;
	const relDir = parent && tree[parent]?.split === 'row' ? (isFirst ? 'right' : 'left') : (isFirst ? 'bottom' : 'top');
	const isFirstInRoot = isFirst && parent === 'root';
	const type = items[id!]?.type;
	const dupable = !!duplicatablePanels?.includes(items[id]?.type as any);
	return <CatchErrors>
		{items[id] && !(items[id]!.type && isFirstInRoot) && <select style={{ borderColor: 'transparent', textAlign: 'left' }} value={type ?? 'empty'}
			onChange={e => setNodeParams(id, { type: e.target.value as any })}>
			{type == null && <option value={'empty'}>Select panel</option>}
			{panelOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
		</select>}
		{!isFirstInRoot && type && <div className='separator'/>}
		{type && <Content {...{ params: items[id]!, setParams: (para) => setNodeParams(id, para) }}/>}
		{items[id] && <div className='separator'/>}
		{!items[id] &&			 <button onClick={() => splitNode(id, 'row', true, dupable)}>Split left</button>}
		{(!items[id] || type) && <button onClick={() => splitNode(id, 'row', false, dupable)}>Split right</button>}
		{!items[id] && 			 <button onClick={() => splitNode(id, 'column', true, dupable)}>Split top</button>}
		{(!items[id] || type) && <button onClick={() => splitNode(id, 'column', false, dupable)}>Split bottom</button>}
		{items[id] && id !== 'root' && !(items[id]!.type && isFirstInRoot) && <button onClick={() => relinquishNode(id)}>Relinquish ({relDir})</button>}
	</CatchErrors>;
}

export function LayoutNav() {
	const { apps, selectLayout, copyLayout, renameLayout, deleteLayout } = useLayoutsStore();
	const { defaultLayouts } = useContext(AppLayoutContext);
	const { list, active } = apps[getApp()] ?? { list: {}, active: {} };
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

export default function AppLayout(props: AppLayoutProps<any>) {
	const startDrag = useLayoutsStore(st => st.startDrag);
	const windows = useLayoutsStore(st => st.windows);
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container);

	useEffect(() => {
		useLayoutsStore.setState(state => {
			state.appsDefaults[getApp()] = props.defaultLayouts;
			if (!state.apps[getApp()])
				state.apps[getApp()] = { active: 'default', list: props.defaultLayouts };
		});
	}, [props.defaultLayouts]);

	useEventListener('resetSettings', () => resetLayout());

	return <div id='layoutRoot' style={{ width: '100%', height: '100%' }} ref={setContainer}
		onMouseLeave={() => startDrag(null)} onMouseUp={() => startDrag(null)}>
		<AppLayoutContext.Provider value={props}>
			<ContextMenu/>
			<CatchErrors>
				<Node {...{ size, id: 'root' }}/>
			</CatchErrors>
			{Object.keys(windows).map(wid => <Window key={wid} id={wid}/>)}
		</AppLayoutContext.Provider>
	</div>;
}