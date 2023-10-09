import React, { createContext } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { dispatchCustomEvent } from './util';
import { TableMenuDetails } from './events/events';
import { LayoutsMenuDetails } from './Layout';

export const KEY_COMB = {
	'openColumnsSelector': 'C',
	'openGenericsSelector': 'G',
	'addFilter': 'F',
	'removeFilter': 'R',
	'exportPlot': 'E',
	'plot': 'P',
	'plotPrev': 'BracketLeft%[',
	'plotNext': 'BracketRight%]',
	'plotPrevShown': 'Comma%<',
	'plotNextShown': 'Period%<',
	'switchViewPlots': 'H',
	'switchHistCorr': 'J',
	'switchTheme': 'T',
	'switchLayout': 'L',
	'commitChanges': 'Ctrl+S',
	'discardChanges': 'Ctrl+X'
} as { [action: string]: string };

export const themeOptions = ['Dark', 'Bright', 'Monochrome'] as const;

type AppSettings = {
	error: null | string,
	theme: typeof themeOptions[number],
	setTheme: (theme: AppSettings['theme']) => void,
	// set: <T extends keyof Settings>(key: T, val: Settings[T]) => void
};

export const useAppSettings = create<AppSettings>()(
	persist((set) => ({
		error: null,
		theme: themeOptions[0],
		setTheme: (theme) => set(state => ({ ...state, theme }))
		// set: (key, val) => set(state => ({ ...state, [key]: val }))
	}), {
		name: 'crwAppSettings',
		partialize: ({ theme }) => ({ theme })
	})
);

export const showError = (err: null | string) => useAppSettings.setState(state =>
	({ ...state, error: err?.toString() }));

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
		dispatchCustomEvent('action+' + action);
	}
}