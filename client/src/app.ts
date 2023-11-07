import React, { createContext } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { dispatchCustomEvent } from './util';
import { TableMenuDetails } from './events/events';
import { LayoutsMenuDetails } from './Layout';
import { color } from './plots/plotUtil';

export const KEY_COMB = {
	'openColumnsSelector': 'C',
	'addFilter': 'F',
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

type AppSettings = {
	log: LogMessage[],
	theme: typeof themeOptions[number],
	setTheme: (theme: AppSettings['theme']) => void,
};

export const logColor = {
	error: color('red'),
	info: color('text'),
	debug: color('text-dark'),
	success: color('green'),
};
type LogMessage = { time: Date, text: string, type: keyof typeof logColor };
export const useAppSettings = create<AppSettings>()(
	persist((set) => ({
		log: [],
		theme: themeOptions[0],
		setTheme: (theme) => set(state => ({ ...state, theme }))
	}), {
		name: 'crwAppSettings',
		partialize: ({ theme }) => ({ theme })
	})
);

export const logMessage = (text: string, type: LogMessage['type']='info' ) => queueMicrotask(() =>
	useAppSettings.setState(state => ({ ...state, log: state.log.concat({ text, type, time: new Date() }) })));
export const logError = (txt?: any) => {txt && logMessage(txt.toString(), 'error');};
export const logSuccess = (txt?: any) => {txt && logMessage(txt.toString(), 'success');};

type menuDetails = {
	layout: LayoutsMenuDetails,
	events: LayoutsMenuDetails & TableMenuDetails,
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

export const openContextMenu = <T extends keyof menuDetails>(type: T, detail?: menuDetails[T]) =>
	(e: React.MouseEvent | MouseEvent) => {
		e.preventDefault(); e.stopPropagation();
		useContextMenu.setState(({ menu }) =>
			({ menu: menu ? null : { x: e.clientX, y: e.clientY, type, detail } }));
	};
export const closeContextMenu = () => useContextMenu.setState(state => state.menu ? { menu: null } : state);

export const AuthContext = createContext<{ login?: string, role?: string, promptLogin: (a: any) => void }>({} as any);

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