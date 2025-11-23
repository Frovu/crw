import { useRef, useState, useContext, useEffect } from 'react';
import { clamp, useEventListener, useSize, type Size } from './util';
import { getApp, openContextMenu } from './app';
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
import { CatchErrors } from './components/CatchErrors';
import ContextMenu from './ContextMenu';
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
					<div className="center border p-2 text-sm flex flex-col gap-1">
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
