import { createContext } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { dispatchCustomEvent } from './util';

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
	'refetch': 'L',
	'commitChanges': 'Ctrl+S',
	'discardChanges': 'Ctrl+X'
} as { [action: string]: string };

export const themeOptions = ['Dark', 'Bright', 'Monochrome'] as const;

type AppSettings = {
	theme: typeof themeOptions[number],
	setTheme: (theme: AppSettings['theme']) => void,
	// set: <T extends keyof Settings>(key: T, val: Settings[T]) => void
};

export const useAppSettings = create<AppSettings>()(
	persist((set) => ({
		theme: themeOptions[0],
		setTheme: (theme) => set(state => ({ ...state, theme }))
		// set: (key, val) => set(state => ({ ...state, [key]: val }))
	}), {
		name: 'crwAppSettings'
	})
);

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