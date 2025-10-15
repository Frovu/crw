import { createContext, type SetStateAction, useState, useContext, useCallback, useEffect, useMemo } from 'react';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import { useSize, useEventListener } from '../util';
import { color } from './plotUtil';

export type NavigationState = {
	cursor: { idx: number; lock: boolean } | null;
	selection: { min: number; max: number } | null;
	focused: { idx: number; label: string } | null;
	chosen: { idx: number; label: string } | null;
	view: { min: number; max: number };
};
export const NavigationContext = createContext<{ state: NavigationState; setState: (a: SetStateAction<NavigationState>) => void }>({} as any);
export function useNavigationState() {
	const [state, setState] = useState<NavigationState>({
		cursor: null,
		selection: null,
		focused: null,
		chosen: null,
		view: { min: 0, max: 0 },
	});
	return { state, setState };
}

export function NavigatedPlot({
	data,
	options: opts,
	moveChosen,
	legendHeight,
	onCreate,
}: {
	data: (number | null)[][];
	options: () => Omit<uPlot.Options, 'width' | 'height'>;
	legendHeight?: number;
	moveChosen?: (inc: number, st: NavigationState, pdata: (number | null)[][]) => NavigationState;
	onCreate?: (u: uPlot) => void;
}) {
	const {
		state: { cursor, selection, focused, chosen },
		setState,
	} = useContext(NavigationContext);
	const set = useCallback((changes: Partial<NavigationState>) => setState((st) => ({ ...st, ...changes })), [setState]);

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);
	const [u, setU] = useState<uPlot>();
	const setUplot = (uu: uPlot) => {
		onCreate?.(uu);
		setU(uu);
	};

	useEffect(() => {
		if (!u) return;
		if (cursor?.lock) {
			const cof = chosen ?? focused;
			const val = cof && u.data[cof.idx][cursor.idx];
			u.setCursor(
				{
					left: u.valToPos(u.data[0][cursor.idx], 'x'),
					top: val == null || !cof ? (u.cursor.top ?? -1) : u.valToPos(u.data[cof.idx][cursor.idx]!, u.series[cof.idx].scale!),
				},
				false,
			);
			if (cof) u.setSeries(cof.idx, { focus: true }, false);
		} else if (!cursor) {
			u.setCursor({ top: -1, left: -1 }, false);
		}
		(u as any).cursor._lock = cursor?.lock ?? false;
	}, [u, cursor, focused, chosen]);

	useEffect(() => {
		const left = selection && u?.valToPos(u.data[0][selection.min], 'x');
		u?.setSelect(
			u && selection
				? {
						width: u.valToPos(u.data[0][selection.max], 'x') - left!,
						height: u.over.offsetHeight,
						top: 0,
						left: left!,
					}
				: { left: 0, top: 0, width: 0, height: 0 },
			false,
		);
	}, [u, selection]);

	useEffect(() => {
		if (!u) return;
		(u as any)._chosen = chosen?.label;
		u.redraw(false, true);
		if (chosen && u.cursor.idx) {
			const val = u.data[chosen.idx][u.cursor.idx];
			const top = val == null ? -1 : u.valToPos(val, u.series[chosen.idx].scale ?? 'y');
			u.setCursor({ left: u.cursor.left!, top }, false);
			u.setSeries(chosen.idx, { focus: true }, false);
		}
	}, [u, chosen]);

	useEffect(() => {
		u?.setSize({ ...size, height: size.height - (legendHeight ?? 0) });
		set({ cursor: null, selection: null });
	}, [u, size, set, legendHeight]);

	useEffect(() => {
		if (!u) return;
		const scale = { min: data[0][0]!, max: data[0][data[0].length - 1]! };
		const resetScale =
			u.data[0][0] !== scale.min ||
			u.data[0][u.data[0].length - 1] !== scale.max ||
			!u.scales.x.max ||
			u.scales.x.max <= scale.min ||
			u.scales.x.min! >= scale.max;
		u.setData(data as any, resetScale);
		u.redraw(true, true);
		u.setSelect(u.select);
		if (resetScale || !u.scales.x.max || !u.scales.x.min) u.setScale('x', scale);
	}, [u, data]);

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (!u) return;
		const moveCursor = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
		const moveVertical = { ArrowUp: -1, ArrowDown: 1 }[e.key];

		if (moveCursor) {
			setState((st) => {
				const left = u.valToIdx(u.scales.x.min!),
					right = u.valToIdx(u.scales.x.max!);
				const len = right - left;
				const cur = st.cursor?.idx ?? (moveCursor < 0 ? right + 1 : left - 1);
				const move = moveCursor * (e.ctrlKey ? Math.ceil(len / 48) : 1) * (e.altKey ? Math.ceil(len / 16) : 1);
				const idx = Math.max(left, Math.min(cur + move, right));

				const sele = (() => {
					if (!e.shiftKey) return null;
					const sel = st.selection,
						min = sel?.min,
						max = sel?.max;
					const vals = !sel || !((cur !== min) !== (cur !== max)) ? [cur, cur + move] : [cur + move, cur !== min ? min! : max!];
					return vals[0] === vals[1]
						? null
						: {
								min: Math.max(left, Math.min(Math.min(...vals), right)),
								max: Math.max(left, Math.min(Math.max(...vals), right)),
							};
				})();

				return { ...st, cursor: { idx, lock: true }, selection: sele };
			});
		} else if (moveVertical && e.ctrlKey) {
			moveChosen && setState((st) => moveChosen(moveVertical, st, data));
		} else if (e.code === 'KeyZ' && selection) {
			u.setScale('x', { min: u.data[0][selection.min], max: u.data[0][selection.max] });
			set({ cursor: null, selection: null });
		} else if (['NumpadEnter', 'Enter'].includes(e.code)) {
			set({ chosen: focused });
		} else if (e.key === 'Escape') {
			set({ cursor: null, selection: null });
			u.setScale('x', { min: u.data[0][0], max: u.data[0][u.data[0].length - 1] });
		}
	});

	const plot = useMemo(() => {
		console.log('PLOT INIT');
		const uOpts = opts();
		let selectingWithMouse = false;
		const options: uPlot.Options = {
			...uOpts,
			...size,
			tzDate: (ts) => uPlot.tzDate(new Date(ts * 1e3), 'UTC'),
			cursor: {
				points: {
					size: 6,
					fill: color('acid'),
					stroke: color('acid'),
				},
				focus: { prox: 32 },
				drag: { dist: 10 },
				bind: {
					dblclick: (upl) => () => {
						set({ cursor: upl.cursor.idx == null ? null : { idx: upl.cursor.idx, lock: true } });
						const fidx = upl.series.findIndex((s: any) => s._focus && s.scale !== 'x');
						if (fidx > 0) set({ chosen: { idx: fidx, label: upl.series[fidx].label as string } });
						return null;
					},
					mousedown: (upl, targ, handler) => (e) => {
						handler(e);
						if (e.button !== 0) return null;
						upl.setSelect({ left: 0, top: 0, width: 0, height: 0 });
						if (!e.ctrlKey && !e.shiftKey) selectingWithMouse = true;
						return null;
					},
					mouseup: (upl: any, targ, handler) => (e) => {
						if (e.button !== 0) return null;
						if (selectingWithMouse) {
							upl.cursor.drag.setScale = false;
							handler(e);
							upl.cursor.drag.setScale = true;
							if (upl.select?.width <= 0) {
								set({ cursor: upl.cursor.idx == null ? null : { idx: upl.cursor.idx, lock: (upl as any).cursor._lock } });
							} else {
								upl.cursor._lock = false;
							}
						} else {
							handler(e);
							set({ selection: null });
						}
						selectingWithMouse = false;
						return null;
					},
				},
				lock: true,
			},
			focus: {
				alpha: 1.1,
			},
			hooks: {
				setCursor: [
					(upl: any) =>
						setState((st) =>
							upl.cursor.idx !== st.cursor?.idx || upl.cursor._lock !== st.cursor?.lock
								? { ...st, cursor: upl.cursor.idx == null ? null : { idx: upl.cursor.idx, lock: upl.cursor._lock } }
								: st,
						),
				],
				setScale: [
					(upl) =>
						set({
							view: {
								min: upl.valToIdx(upl.scales.x.min!),
								max: upl.valToIdx(upl.scales.x.max!),
							},
						}),
				],
				setSelect: [
					(upl) =>
						set({
							selection:
								upl.select && upl.select.width
									? {
											min: upl.posToIdx(upl.select.left),
											max: upl.posToIdx(upl.select.left + upl.select.width),
										}
									: null,
						}),
				],
				setSeries: [(upl: any, si) => si != null && upl.series[si]?._focus && set({ focused: { idx: si, label: upl.series[si].label } })],
				ready: [
					(upl) => upl.setCursor({ left: -1, top: -1 }), // ??
				],
			},
		};
		for (const ev in uOpts.hooks) // bruh
			(options.hooks as any)[ev] = ((options.hooks as any)[ev] ?? []).concat((uOpts.hooks as any)[ev]);
		return <UplotReact {...{ options, data: data as any, onCreate: setUplot }} />;
	}, [opts, set]); // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<div ref={(node) => setContainer(node)} style={{ position: 'absolute' }}>
			{size.width > 0 && plot}
		</div>
	);
}
