import React, { CSSProperties, createContext } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { dispatchCustomEvent } from './util';
import { TableMenuDetails } from './events/events';
import { LayoutsMenuDetails } from './Layout';
import { RgbaColor, rgbaToHexa } from '@uiw/react-color';
import { immer } from 'zustand/middleware/immer';

export const KEY_COMB = {
	'openColumnsSelector': 'C',
	'addFilter': 'F',
	'computeRow': 'K',
	'setX': '1',
	'setY': '2',
	'exportPlot': 'E',
	'plot': 'P',
	'plotPrev': 'BracketLeft%[',
	'plotNext': 'BracketRight%]',
	'plotPrevShown': 'Comma%<',
	'plotNextShown': 'Period%<',
	'switchTheme': 'T',
	'switchLayout': 'L',
	'commitChanges': 'Ctrl+S',
	'discardChanges': 'Ctrl+X'
} as { [action: string]: string };

export const themeOptions = ['Dark', 'Bright', 'Monochrome'] as const;

type LogMessage = { time: Date, text: string, type: 'error' | 'info' | 'debug' | 'success' };

export const colorKeys = ['magenta', 'magenta2', 'cyan', 'cyan2', 'skyblue', 'blue', 'purple',
	'peach', 'white', 'acid', 'gold', 'green', 'yellow', 'orange', 'red', 'crimson',
	'bg', 'input-bg', 'text', 'text-dark', 'border', 'grid', 'active', 'area', 'area2'];

type AppSettings = {
	log: LogMessage[],
	theme: typeof themeOptions[number],
	colors: { [theme: string]: { [key: string]: RgbaColor } },
	setTheme: (theme: AppSettings['theme']) => void,
	renderColors: () => CSSProperties,
	setColor: (which: string, val: RgbaColor) => void,
	resetColor: (which: string) => void,
	resetColors: () => void,
};
export const useAppSettings = create<AppSettings>()(
	immer(persist((set, get) => ({
		log: [],
		colors: {},
		theme: themeOptions[0],
		setTheme: (theme) => set(state => ({ ...state, theme })),
		setColor: (col, val) => set(({ colors, theme }) => {
			if (!colors[theme])
				colors[theme] = {};
			colors[theme][col] = val; }),
		resetColor: col => set(({ colors, theme }) => {
			delete colors[theme][col]; }),
		resetColors: () => set(({ colors, theme }) => {
			colors[theme] = {}; }),
		renderColors: () => Object.fromEntries((Object.entries(get().colors[get().theme] ?? {}))
			.map(([name, val]) => ['--color-'+name, rgbaToHexa(val)]))
	}), {
		name: 'crwAppSettings',
		partialize: ({ theme, colors }) => ({ theme, colors })
	}))
);

export function color(name: typeof colorKeys[number], alpha?: number) {
	const { colors, theme } = useAppSettings.getState();
	const col = colors[theme]?.[name] ?? getDefaultColor(name);
	return rgbaToHexa({ ...col, a: alpha ?? col.a });
}

export function getDefaultColor(name: string): RgbaColor {
	const col = window.getComputedStyle(document.body).getPropertyValue('--color-'+name);
	console.assert(col && col.includes('rgb'));
	const [r, g, b, a] = col.match(/[\d.]+/g)!.map(p => parseFloat(p));
	return { r, g, b, a: isNaN(a) ? 1 : a };
}

export const logMessage = (text: string, type: LogMessage['type']='info' ) => queueMicrotask(() =>
	useAppSettings.setState(state => ({ ...state, log: state.log.concat({ text, type, time: new Date() }) })));
export const logError = (txt?: any) => {txt && logMessage(txt.toString(), 'error');};
export const logSuccess = (txt?: any) => {txt && logMessage(txt.toString(), 'success');};

export const logColor = {
	error: color('red'),
	info: color('text'),
	debug: color('text-dark'),
	success: color('green'),
};

type menuDetails = {
	layout: LayoutsMenuDetails,
	events: LayoutsMenuDetails & TableMenuDetails,
	tableExport: undefined,
	app: undefined,
};
type ContextMenu = {
	menu: null | {
		x: number, y: number,
		type: keyof menuDetails,
		detail?: menuDetails[keyof menuDetails]
	}
};

export const useContextMenu = create<ContextMenu>()(set => ({
	menu: null
}));

export const openContextMenu = <T extends keyof menuDetails>(type: T, detail?: menuDetails[T], force?: boolean) =>
	(e: React.MouseEvent | MouseEvent) => {
		e.preventDefault(); e.stopPropagation();
		useContextMenu.setState(({ menu }) =>
			({ menu: !force && menu ? null : { x: e.clientX, y: e.clientY, type, detail } }));
	};
export const closeContextMenu = () => useContextMenu.setState(state => state.menu ? { menu: null } : state);

export const roleOptions = ['admin', 'operator'] as const;
export const AuthContext = createContext<{ login?: string, role?: typeof roleOptions[number], promptLogin: (a: any) => void }>({} as any);

export function handleGlobalKeydown(e: KeyboardEvent) {
	if (e.code === 'Escape')
		return dispatchCustomEvent('escape');
	if ((e.target instanceof HTMLInputElement && e.target.type !== 'checkbox') || e.target instanceof HTMLSelectElement)
		return;

	const keycomb = (e.ctrlKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + e.code.replace(/Key|Digit/, '');
	const action = Object.keys(KEY_COMB).find(k => KEY_COMB[k].split('%')[0] === keycomb);
	if (action) {
		e.preventDefault();
		e.stopPropagation();
		dispatchCustomEvent('action+' + action);
	}
}