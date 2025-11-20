import { useRef, useState, useContext, useEffect } from 'react';
import { clamp, useEventListener, useSize, type Size } from './util';
import { color, getApp, KEY_COMB, openContextMenu } from './app';
import {
	useLayoutsStore,
	useLayout,
	relinquishNode,
	LayoutContext,
	setNodeParams,
	gapSize,
	type LayoutsMenuDetails,
	splitNode,
	resetLayoutsState,
	AppLayoutContext,
	type AppLayoutProps,
	setWindowParams,
	closeWindow,
	moveWindow,
	type Panel,
	type NodeParams,
	type ContextMenuProps,
} from './layout';
import { CatchErrors } from './Utility';
import ContextMenu from './ContextMenu';
import { defaultLayouts } from './defaultLayouts';
import { Checkbox } from './components/Checkbox';
import { Button, CloseButton } from './components/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/Select';

function Window({ id }: { id: string }) {
	const { panels } = useContext(AppLayoutContext);
	const { params: rawParams, ...pos } = useLayoutsStore((st) => st.windows[id]) ?? {};
	const size = { height: pos.h, width: pos.w };
	const panel: Panel<{}> | undefined = panels[rawParams.type ?? ''];

	const drag = useRef<null | { pos: typeof pos; x: number; y: number; resize?: string }>(null);

	useEventListener('mousemove', (e) => {
		if (!drag.current) return;
		const {
			pos: { x, y, w, h },
			x: sx,
			y: sy,
			resize,
		} = drag.current;
		const cx = e.clientX,
			cy = e.clientY;
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

	if (!panel) {
		relinquishNode(id);
		return null;
	}

	const params = { ...panel.defaultParams, ...rawParams };

	return (
		<div
			className="fixed z-3 bg-bg p-[1px] border"
			style={{ left: pos.x, top: pos.y, width: pos.w, height: pos.h }}
			onDoubleClick={() => closeWindow(id)}
			onMouseDown={(e) => {
				drag.current = { pos, x: e.clientX, y: e.clientY };
			}}
			onContextMenu={openContextMenu('layout', { nodeId: id, window: { ...params } })}
		>
			<LayoutContext.Provider
				value={{ id, size, params, panel, isWindow: true, setParams: (para) => setWindowParams(id, para) }}
			>
				<CatchErrors>
					<panel.Panel />
				</CatchErrors>
			</LayoutContext.Provider>
			<CloseButton className="absolute -top-[1px] -right-[1px] bg-bg border" onClick={() => closeWindow(id)} />
			<div
				style={{ position: 'absolute', cursor: 'nw-resize', zIndex: 4, top: -4, left: -4, width: 16, height: 16 }}
				onMouseDown={(e) => {
					drag.current = { pos, x: e.clientX, y: e.clientY, resize: 'nw' };
					e.stopPropagation();
				}}
			/>
			<div
				style={{ position: 'absolute', cursor: 'sw-resize', zIndex: 4, bottom: -4, left: -4, width: 16, height: 16 }}
				onMouseDown={(e) => {
					drag.current = { pos, x: e.clientX, y: e.clientY, resize: 'sw' };
					e.stopPropagation();
				}}
			/>
			<div
				style={{ position: 'absolute', cursor: 'se-resize', zIndex: 4, bottom: -4, right: -4, width: 16, height: 16 }}
				onMouseDown={(e) => {
					drag.current = { pos, x: e.clientX, y: e.clientY, resize: 'se' };
					e.stopPropagation();
				}}
			/>
		</div>
	);
}

function Item({ id, size }: { id: string; size: Size }) {
	const { panels } = useContext(AppLayoutContext);
	const { startDrag, dragOver, finishDrag } = useLayoutsStore.getState();
	const { items } = useLayout();
	const item = items[id];
	const panel: Panel<{}> | undefined = panels[item?.type ?? ''];
	if (!item || (item.type && !panel)) {
		console.log('uknown item type: ', item?.type, id);
		relinquishNode(id);
		return null;
	}
	const params = { ...panel?.defaultParams, ...item };

	return (
		item && (
			<div
				style={{ ...size, position: 'relative', overflow: 'clip' }}
				onContextMenu={openContextMenu('layout', { nodeId: id })}
				onMouseDown={(e) => e.ctrlKey && startDrag(id)}
				onMouseEnter={() => dragOver(id)}
				onMouseUp={() => finishDrag()}
			>
				{panel && (
					<LayoutContext.Provider value={{ id, size, params, panel, setParams: (para) => setNodeParams(id, para) }}>
						<CatchErrors>
							<panel.Panel />
						</CatchErrors>
					</LayoutContext.Provider>
				)}
				{!item.type && (
					<div className="center border p-2 text-sm">
						<CatchErrors>
							<LayoutContextMenu id={id} />
						</CatchErrors>
					</div>
				)}
			</div>
		)
	);
}

function Node({ id, size }: { id: string; size: Size }) {
	const drag = useRef<{ ratio: number; click: number } | null>(null);
	const updateRatio = useLayoutsStore((st) => st.updateRatio);
	const { tree } = useLayout();

	if (tree[id] == null) return <Item {...{ id, size }} />;

	const { split, children, ratio } = tree[id]!;

	const isRow = split === 'row';
	const dim = isRow ? 'width' : 'height';
	const otherDim = isRow ? 'height' : 'width';
	const propsA = { id: children![0], size: { ...size, [dim]: Math.round(size[dim] * ratio! - gapSize / 2) } };
	const propsB = { id: children![1], size: { ...size, [dim]: Math.round(size[dim] * (1 - ratio!) - gapSize / 2) } };

	return (
		<div
			className="relative flex justify-between"
			style={{ ...size, flexDirection: split }}
			onMouseMove={(e) => {
				if (!drag.current) return;
				const delta = (isRow ? e.clientX : e.clientY) - drag.current.click;
				updateRatio(id, clamp(0.05, 0.95, drag.current.ratio + delta / size[dim]));
			}}
			onMouseUp={() => {
				drag.current = null;
			}}
			onMouseLeave={() => {
				drag.current = null;
			}}
		>
			<Node {...propsA} />
			<div
				className="absolute z-2 select-none"
				style={{
					...size,
					[dim]: 12,
					[isRow ? 'left' : 'top']: size[dim] * ratio! - 6,
					cursor: isRow ? 'col-resize' : 'row-resize',
				}}
				onContextMenu={openContextMenu('layout', { nodeId: id })}
				onMouseDown={(e) => {
					if (e.ctrlKey) return updateRatio(id, clamp(0.05, 0.95, (size[otherDim] + gapSize / 2) / size[dim]));
					drag.current = { ratio, click: isRow ? e.clientX : e.clientY };
				}}
			/>
			<Node {...propsB} />
		</div>
	);
}

export function LayoutContextMenu({ id: argId, detail }: { id?: string; detail?: LayoutsMenuDetails }) {
	const { panels } = useContext(AppLayoutContext);
	const { items, tree } = useLayout();
	const windows = useLayoutsStore((st) => st.windows);
	const id = argId ?? detail?.nodeId;
	const window = detail?.window;

	if (!id) return null;

	const item = items[id];
	const type = (window ? window.type : item?.type) ?? null;
	const panel: Panel<object> | undefined = panels[type ?? ''];
	const params: NodeParams<{ [k: string]: any }> = { type, ...panel?.defaultParams, ...(window ?? item) };

	const cb: ContextMenuProps<object>['Checkbox'] = ({ k, ...props }) => (
		<Checkbox {...props} checked={params[k]} onCheckedChange={(val) => setNodeParams(id, { [k]: val })} />
	);

	const parent = Object.keys(tree).find((node) => tree[node]?.children.includes(id));
	const isFirst = parent && tree[parent]?.children[0] === id;
	const relDir = parent && tree[parent]?.split === 'row' ? (isFirst ? 'right' : 'left') : isFirst ? 'bottom' : 'top';
	const isFirstInRoot = isFirst && parent === 'root';
	const dupable = !!panel?.isDuplicatable;

	return (
		<CatchErrors>
			{item && !(type && isFirstInRoot) && (
				<Select value={type ?? ''} onValueChange={(val) => setNodeParams(id, { type: val })}>
					<SelectTrigger>
						<SelectValue placeholder={'Select panel'} />
					</SelectTrigger>
					<SelectContent>
						{Object.keys(panels).map((label) => {
							const Icon = panels[label]?.Icon;
							return (
								<SelectItem key={label} value={label}>
									<div className="flex items-center gap-2">
										{Icon && <Icon size={20} strokeWidth={1.5} />}
										{label}
									</div>
								</SelectItem>
							);
						})}
					</SelectContent>
				</Select>
			)}
			{!isFirstInRoot && type && !window && <div className="separator" />}
			{window && panel?.Menu && (
				<panel.Menu
					{...{ params: windows[id!].params, setParams: (para) => setWindowParams(id, para), Checkbox: cb }}
				/>
			)}
			{!window && panel?.Menu && (
				<panel.Menu {...{ params, setParams: (para) => setNodeParams(id, para), Checkbox: cb }} />
			)}
			{item && <div className="separator" />}
			{!window && (!item || type) && (
				<>
					{!type && <Button onClick={() => splitNode(id, 'row', true, dupable)}>Split left</Button>}
					{<Button onClick={() => splitNode(id, 'row', false, dupable)}>Split right</Button>}
					{!type && <Button onClick={() => splitNode(id, 'column', true, dupable)}>Split top</Button>}
					{<Button onClick={() => splitNode(id, 'column', false, dupable)}>Split bottom</Button>}
				</>
			)}
			{item && id !== 'root' && !(item.type && isFirstInRoot) && (
				<Button onClick={() => relinquishNode(id)}>Relinquish ({relDir})</Button>
			)}
		</CatchErrors>
	);
}

export function LayoutNav() {
	const { apps, selectLayout, copyLayout, renameLayout, deleteLayout, toggleCycling } = useLayoutsStore();
	const { list, active } = apps[getApp()] ?? { list: {}, active: '' };
	const [hovered, setHovered] = useState<0 | 1 | 2>(0);
	const [renaming, setRenaming] = useState<{ layout: string; input: string } | null>(null);
	const [open, setOpen] = useState(false);
	const layouts = Object.keys(list);

	const cycleLayouts = (idx: number): any => {
		const next = (idx + 1) % layouts.length;
		if (!list[layouts[next]].ignoreWhenCycling || layouts[next] === active) {
			return selectLayout(layouts[next]);
		}
		return cycleLayouts(next);
	};

	useEventListener('click', () => {
		setOpen(false);
		setRenaming(null);
	});
	useEventListener('contextmenu', () => {
		setOpen(false);
		setRenaming(null);
	});
	useEventListener('action+switchLayout', () => cycleLayouts(layouts.indexOf(active)));

	const defaultL = defaultLayouts[getApp() as keyof typeof defaultLayouts]?.list;

	return (
		<div
			style={{ padding: '2px 0 2px 4px', position: 'relative' }}
			onMouseEnter={() => setHovered(1)}
			onMouseLeave={() => setHovered(0)}
		>
			{open && (
				<div
					className="ContextMenu"
					style={{ position: 'absolute', left: -1, bottom: 'calc(100%)' }}
					onClick={(e) => e.stopPropagation()}
				>
					{layouts.map((layout) => {
						const isUsers = defaultL[layout],
							isActive = active === layout;
						return (
							<div key={layout} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
								{renaming?.layout === layout ? (
									<input
										type="text"
										style={{
											width: renaming.input.length + 1 + 'ch',
											maxWidth: '20em',
											height: '1.25em',
											flex: 1,
											color: color('text'),
										}}
										autoFocus
										onFocus={(e) => e.target.select()}
										onKeyDown={(e) =>
											['Enter', 'NumpadEnter'].includes(e.code) && (e.target as any).blur?.()
										}
										onBlur={() => {
											renameLayout(renaming.layout, renaming.input);
											setRenaming(null);
										}}
										value={renaming.input}
										onChange={(e) => setRenaming({ ...renaming, input: e.target.value })}
									/>
								) : (
									<span
										style={{
											flex: 1,
											cursor: 'pointer',
											color: isActive ? color('active') : isUsers ? color('text') : 'unset',
										}}
										onClick={() => selectLayout(layout)}
									>
										{layout}
									</span>
								)}
								<div style={{ minWidth: 8 }} />
								<Button
									hidden={!isUsers}
									className="TextButton"
									onClick={() => setRenaming({ layout, input: layout })}
								>
									rename
								</Button>
								<Button className="TextButton" onClick={() => copyLayout(layout)}>
									copy
								</Button>
								<label title={`Cycle with ${KEY_COMB.switchLayout} key`}>
									cycle
									<input
										type="checkbox"
										checked={!list[layout].ignoreWhenCycling}
										onChange={(e) => toggleCycling(layout, !e.target.checked)}
									/>
								</label>
								{isUsers ? (
									<div className="CloseButton" onClick={() => deleteLayout(layout)} />
								) : (
									<div style={{ minWidth: '1em' }} />
								)}
							</div>
						);
					})}
				</div>
			)}
			<span
				style={{
					cursor: 'pointer',
					color: open || hovered > 1 ? color('active') : 'unset',
					textDecoration: !open && hovered > 0 ? 'underline' : 'unset',
				}}
				onClick={(e) => {
					e.stopPropagation();
					setOpen((o) => !o);
				}}
				onMouseEnter={() => setHovered(2)}
				onMouseLeave={() => setHovered(1)}
			>
				{open || hovered > 0 ? 'manage' : 'layout'}
			</span>
			:
			<select style={{ width: active.length + 3 + 'ch' }} value={active} onChange={(e) => selectLayout(e.target.value)}>
				{Object.keys(list).map((la) => (
					<option key={la} value={la}>
						{la}
					</option>
				))}
			</select>
		</div>
	);
}

export default function AppLayout(props: AppLayoutProps<any>) {
	const startDrag = useLayoutsStore((st) => st.startDrag);
	const windows = useLayoutsStore((st) => st.windows);
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container);

	useEventListener('resetSettings', () => resetLayoutsState());

	useEffect(() => {
		// FIXME: but idk how
		useLayoutsStore.setState((st) => {
			st.panels[getApp()] = Object.values(props.panels);
		});
	}, [props.panels]);

	return (
		<div
			id="layoutRoot"
			className="w-full h-full"
			ref={setContainer}
			onMouseLeave={() => startDrag(null)}
			onMouseUp={() => startDrag(null)}
		>
			<AppLayoutContext.Provider value={props}>
				<ContextMenu />
				<CatchErrors>
					<Node {...{ size, id: 'root' }} />
				</CatchErrors>
				{Object.keys(windows).map((wid) => (
					<Window key={wid} id={wid} />
				))}
			</AppLayoutContext.Provider>
		</div>
	);
}
