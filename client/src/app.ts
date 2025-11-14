import React, { type CSSProperties, createContext, type ReactNode } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { dispatchCustomEvent } from './util';
import type { LayoutsMenuDetails } from './layout';
import { type RgbaColor, hexToRgba, rgbaToHexa } from '@uiw/color-convert';
import { immer } from 'zustand/middleware/immer';
import type { TextTransformMenuDetail } from './events/export/ExportPlot';
import type { TableEntity, TableMenuDetails } from './events/tables/Table';

export const APPS = ['feid', 'meteo', 'muon', 'neutron', 'omni', 'ros'] as const;

export const KEY_COMB = {
	openColumnsSelector: 'C',
	addFilter: 'F',
	computeRow: 'K',
	setX: '1',
	setY: '2',
	plot: 'P',
	cycleSource: 'S',
	plotPrev: 'BracketLeft%[',
	plotNext: 'BracketRight%]',
	plotPrevShown: 'Comma%<',
	plotNextShown: 'Period%<',
	openInfo: 'H',
	switchTheme: 'T',
	switchLayout: 'L',
	commitChanges: 'Ctrl+S',
	discardChanges: 'Ctrl+X',
} as { [action: string]: string };

export const themeOptions = ['Dark', 'Bright', 'Monochrome'] as const;

type LogMessage = { time: Date; text: string; type: 'error' | 'info' | 'debug' | 'success' };

export const colorKeys = [
	'magenta',
	'magenta2',
	'cyan',
	'cyan2',
	'skyblue',
	'blue',
	'purple',
	'peach',
	'white',
	'acid',
	'gold',
	'green',
	'yellow',
	'orange',
	'red',
	'crimson',
	'bg',
	'input-bg',
	'text',
	'text-dark',
	'border',
	'grid',
	'active',
	'area',
	'area2',
];

export const infoPages = ['manual', 'advanced', 'shortcuts', 'credit'] as const;

type AppSettings = {
	app: (typeof APPS)[number] | null;
	log: LogMessage[];
	infoOpen: boolean;
	infoPage: (typeof infoPages)[number];
	theme: (typeof themeOptions)[number];
	colors: { [theme: string]: { [key: string]: RgbaColor } };
	setApp: (app: (typeof APPS)[number]) => void;
	setTheme: (theme: AppSettings['theme']) => void;
	renderColors: () => CSSProperties;
	setColor: (which: string, val: RgbaColor) => void;
	openInfo: () => void;
	closeInfo: () => void;
	setInfoPage: (page: AppSettings['infoPage']) => void;
	resetColor: (which: string) => void;
	resetColors: () => void;
};
export const useAppSettings = create<AppSettings>()(
	immer(
		persist(
			(set, get) => ({
				app: null,
				log: [],
				infoOpen: false,
				infoPage: 'manual',
				colors: {},
				theme: themeOptions[0],
				setApp: (app) => set((state) => ({ ...state, app })),
				setTheme: (theme) => set((state) => ({ ...state, theme })),
				openInfo: () => set((state) => ({ ...state, infoOpen: true })),
				closeInfo: () => set((state) => ({ ...state, infoOpen: false })),
				setInfoPage: (page) => set((state) => ({ ...state, infoPage: page })),
				setColor: (col, val) =>
					set(({ colors, theme }) => {
						if (!colors[theme]) colors[theme] = {};
						colors[theme][col] = val;
					}),
				resetColor: (col) =>
					set(({ colors, theme }) => {
						delete colors[theme][col];
					}),
				resetColors: () =>
					set(({ colors, theme }) => {
						colors[theme] = {};
					}),
				renderColors: () =>
					Object.fromEntries(
						Object.entries(get().colors[get().theme] ?? {}).map(([name, val]) => [
							'--color-' + name,
							rgbaToHexa(val),
						])
					),
			}),
			{
				name: 'crwAppSettings',
				partialize: ({ theme, colors }) => ({ theme, colors }),
			}
		)
	)
);

export const getApp = () => useAppSettings.getState().app ?? 'feid';

export function color(name: (typeof colorKeys)[number], alpha?: number) {
	const { colors, theme } = useAppSettings.getState();
	const col = colors[theme]?.[name] ?? getDefaultColor(name);
	return rgbaToHexa({ ...col, a: alpha ?? col.a });
}

export function getDefaultColor(name: string): RgbaColor {
	const col = window.getComputedStyle(document.body).getPropertyValue('--color-' + name);
	if (!col) {
		console.error('color not found: ' + name);
		return { r: 255, g: 0, b: 0, a: 1 };
	}
	if (col.includes('rgb')) {
		const [r, g, b, a] = col.match(/[\d.]+/g)!.map((p) => parseFloat(p));
		return { r, g, b, a: isNaN(a) ? 1 : a };
	}
	return hexToRgba(col);
}

export const logMessage = (text: string, type: LogMessage['type'] = 'info') =>
	queueMicrotask(() =>
		useAppSettings.setState((state) => ({ ...state, log: state.log.concat({ text, type, time: new Date() }) }))
	);
export const logError = (txt?: any) => {
	txt && logMessage(txt.toString(), 'error');
};
export const logSuccess = (txt?: any) => {
	txt && logMessage(txt.toString(), 'success');
};

export const logColor = {
	error: color('red'),
	info: color('text'),
	debug: color('text-dark'),
	success: color('green'),
};

type menuDetails = {
	layout: LayoutsMenuDetails;
	events: LayoutsMenuDetails & TableMenuDetails;
	tableExport: never;
	textTransform: TextTransformMenuDetail;
	app: never;
};

type ContextMenu = {
	menu: null | {
		x: number;
		y: number;
		type: keyof menuDetails;
		detail?: menuDetails[keyof menuDetails];
	};
	confirmation: null | {
		callback: () => void;
		onClose?: () => void;
		content: ReactNode;
	};
};

export const useContextMenuStore = create<ContextMenu>()((set) => ({
	menu: null,
	confirmation: null,
}));

export const useContextMenu = <T extends keyof menuDetails>() =>
	useContextMenuStore((state) => state.menu?.detail) as menuDetails[T] | undefined;

export const useEventsContextMenu = <T extends TableEntity>() => useContextMenu() as LayoutsMenuDetails & TableMenuDetails<T>;

export const openContextMenu =
	<T extends keyof menuDetails>(type: T, detail?: menuDetails[T], force?: boolean) =>
	(e: React.MouseEvent | MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		useContextMenuStore.setState(({ menu }) => ({
			menu: !force && menu ? null : { x: e.clientX, y: e.clientY, type, detail },
		}));
	};

export const openConfirmation = (conf: ContextMenu['confirmation']) =>
	useContextMenuStore.setState((s) => {
		s.confirmation?.onClose?.();
		return { ...s, confirmation: conf };
	});

export const closeContextMenu = () => useContextMenuStore.setState((s) => ({ ...s, menu: null }));

export const closeConfirmation = () =>
	useContextMenuStore.setState((s) => {
		s.confirmation?.onClose?.();
		return { ...s, confirmation: null };
	});

export const roleOptions = ['admin', 'operator'] as const;

export const AuthContext = createContext<{
	login?: string;
	role?: (typeof roleOptions)[number];
	promptLogin: (a: any) => void;
}>({} as any);

export function handleGlobalKeydown(e: KeyboardEvent) {
	if (e.code === 'Escape') return dispatchCustomEvent('escape');
	if ((e.target instanceof HTMLInputElement && e.target.type !== 'checkbox') || e.target instanceof HTMLSelectElement) return;

	const keycomb = (e.ctrlKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + e.code.replace(/Key|Digit/, '');
	const action = Object.keys(KEY_COMB).find((k) => KEY_COMB[k].split('%')[0] === keycomb);
	if (action) {
		e.preventDefault();
		e.stopPropagation();
		dispatchCustomEvent('action+' + action);
	}
}
