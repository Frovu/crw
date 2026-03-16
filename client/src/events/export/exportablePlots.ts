import uPlot from 'uplot';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { color, getApp } from '../../app';
import { useLayoutsStore, gapSize } from '../../layout';
import type { ScaleParams } from '../../plots/basicPlot';
import { type PlotsOverrides, withOverrides } from '../../plots/plotUtil';
import type { EventsPanel } from '../core/util';
import type { TextTransform } from '../../api';

type uOptions = Omit<uPlot.Options, 'width' | 'height'>;

type PlotEntryParams = {
	options: () => uOptions;
	data: (number | null)[][];
	scales: { [key: string]: ScaleParams };
};

type PlotExportState = {
	inches: number;
	overrides: PlotsOverrides;
	perPlotScales: boolean;
	savedScales: { [id: number]: { [key: string]: ScaleParams } };
	plots: { [nodeId: string]: PlotEntryParams };
	set: <T extends keyof PlotsOverrides>(k: T, v: PlotsOverrides[T]) => void;
	setTransform: (id: number, val: Partial<TextTransform>) => void;
	swapTransforms: (a: number, b: number) => void;
	setInches: (v: number) => void;
	addScale: (id: number, k: string, scl: ScaleParams) => void;
	removeScale: (id: number, k: string) => void;
	setScale: (id: number, k: string, scl: Partial<ScaleParams>) => void;
	setPerPlotMode: (id: number, v: boolean) => void;
	restoreScales: (id: number) => void;
};

export const usePlotExportSate = create<PlotExportState>()(
	persist(
		immer((set) => ({
			inches: 12 / 2.54,
			perPlotScales: false,
			savedScales: {},
			overrides: {
				scale: 2,
				fontSize: 14,
				scalesParams: {},
			},
			plots: {},
			set: (k, v) =>
				set((state) => {
					state.overrides[k] = v;
				}),
			setTransform: (id, val) =>
				set(({ overrides: { textTransform } }) => {
					const found = textTransform?.find((t) => t.id === id);
					if (found) Object.assign(found, val);
				}),
			swapTransforms: (idA, idB) =>
				set(({ overrides }) => {
					const foundA = overrides.textTransform?.find((t) => t.id === idA);
					const foundB = overrides.textTransform?.find((t) => t.id === idB);
					overrides.textTransform = overrides.textTransform?.map(
						(t) => (t.id === idA ? foundB : t.id === idB ? foundA : t) ?? t,
					);
				}),
			setInches: (v) =>
				set((state) => {
					state.inches = v;
				}),
			addScale: (id, k, scl) =>
				set(({ overrides, perPlotScales, savedScales }) => {
					overrides.scalesParams = { ...overrides.scalesParams, [k]: scl };
					if (perPlotScales) savedScales[id] = overrides.scalesParams ?? {};
				}),
			removeScale: (id, k) =>
				set(({ overrides, perPlotScales, savedScales }) => {
					if (overrides.scalesParams?.[k]) delete overrides.scalesParams[k];
					if (perPlotScales) savedScales[id] = overrides.scalesParams ?? {};
				}),
			setScale: (id, k, scl) =>
				set(({ overrides, perPlotScales, savedScales }) => {
					if (overrides.scalesParams?.[k]) Object.assign(overrides.scalesParams?.[k], scl);
					if (perPlotScales) savedScales[id] = overrides.scalesParams ?? {};
				}),
			setPerPlotMode: (id, val) =>
				set((state) => {
					state.perPlotScales = val;
					if (val && state.savedScales[id]) state.overrides.scalesParams = state.savedScales[id];
				}),
			restoreScales: (id) =>
				set((state) => {
					if (state.perPlotScales) state.overrides.scalesParams = state.savedScales[id] ?? {};
				}),
		})),
		{
			name: 'plotsExportState',
			partialize: ({ overrides, inches }) => ({ overrides, inches }),
		},
	),
);

export function computePlotsLayout() {
	const state = useLayoutsStore.getState();
	const panels = state.panels[getApp()] as EventsPanel<any>[];
	const { active, list } = state.apps[getApp()];
	const { tree, items } = list[active];

	const root = document.getElementById('layoutRoot')!;

	const layout: { [k: string]: { x: number; y: number; w: number; h: number } } = {};
	const walk = (x: number, y: number, w: number, h: number, node: string = 'root') => {
		if (!tree[node]) {
			if (panels?.find((p) => p.name === items[node]?.type)?.isPlot)
				layout[node] = { x, y, w: Math.floor(w), h: Math.floor(h) };
			return;
		}
		const { split, ratio, children } = tree[node]!;
		const splitX = Math.floor(split === 'row' ? w * ratio - gapSize / 2 : 0);
		const splitY = Math.floor(split === 'column' ? h * ratio - gapSize / 2 : 0);
		walk(x, y, splitX || w, splitY || h, children[0]);
		walk(x + splitX, y + splitY, w - splitX, h - splitY, children[1]);
	};
	walk(0, 0, root?.offsetWidth, root?.offsetHeight);

	if (!Object.values(layout).length) return { width: 0, height: 0, layout };

	const [minX, minY] = (['x', 'y'] as const).map((d) =>
		Math.min.apply(
			null,
			Object.values(layout).map((pos) => pos[d]),
		),
	);
	const [maxX, maxY] = (['x', 'y'] as const).map((d) =>
		Math.max.apply(
			null,
			Object.values(layout).map((pos) => pos[d] + pos[d === 'x' ? 'w' : 'h']),
		),
	);

	for (const node in layout) {
		layout[node].x -= minX;
		layout[node].y -= minY;
	}

	return {
		width: Math.ceil(maxX - minX),
		height: Math.ceil(maxY - minY),
		layout,
	};
}

export async function renderPlotInANewTab(nodeId: string) {
	const { plots } = usePlotExportSate.getState();
	const { active, list } = useLayoutsStore.getState().apps[getApp()];
	const {
		overrides: { scalesParams, textTransform },
	} = usePlotExportSate.getState();
	const { layout } = computePlotsLayout();

	if (!layout[nodeId] || !plots[nodeId]) return;

	const { options, data } = plots[nodeId];
	const { w, h } = layout[nodeId];
	const scl = w < 600 ? 6 : 4;
	const canvas = document.createElement('canvas');
	canvas.width = w * scl * devicePixelRatio;
	canvas.height = h * scl * devicePixelRatio;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = color('bg');
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	const controlsPresent = !!Object.values(list[active]?.items).find((i) => i?.type === 'ExportControls');
	const opts = {
		...withOverrides(options, {
			scale: scl,
			...(controlsPresent && { scalesParams, textTransform: textTransform?.filter((tr) => tr.enabled) }),
		}),
		width: Math.round(w * scl),
		height: Math.round(h * scl),
	};

	new uPlot(opts, data as any, (u, init) => {
		init();
		queueMicrotask(() => {
			ctx.drawImage(u.ctx.canvas, 0, 0);
			u.destroy();
			canvas.toBlob((blob) => blob && window.open(URL.createObjectURL(blob)));
		});
	});
}

export async function renderPlotsInCanvas() {
	const { width, height, layout } = computePlotsLayout();
	const { plots, inches, overrides } = usePlotExportSate.getState();
	const { scale, fontSize, textTransform } = overrides;
	const canvas = document.createElement('canvas');
	canvas.width = width * scale * devicePixelRatio;
	canvas.height = height * scale * devicePixelRatio;
	const ctx = canvas.getContext('2d')!;
	ctx.fillStyle = color('bg');
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	for (const [nodeId, node] of Object.entries(layout)) {
		const [x, y, w, h] = (['x', 'y', 'w', 'h'] as const).map((d) => scale * node[d]);
		if (!plots[nodeId]) continue;
		const { options, data } = plots[nodeId];
		const opts = {
			...withOverrides(options, {
				...overrides,
				textTransform: textTransform?.filter((tr) => tr.enabled),
				fontSize: (width / inches / 72) * fontSize,
			}),
			width: Math.round(w),
			height: Math.round(h),
		};
		const upl: uPlot = await new Promise(
			(resolve) =>
				new uPlot(opts, data as any, (u, init) => {
					init();
					resolve(u);
				}),
		);
		ctx.drawImage(upl.ctx.canvas, Math.round(x * devicePixelRatio), Math.round(y * devicePixelRatio));
		upl.destroy();
	}
	return canvas;
}
