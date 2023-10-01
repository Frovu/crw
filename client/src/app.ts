import { createContext } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

type Settings = {
	theme: typeof themeOptions[number],
	setTheme: (theme: Settings['theme']) => void,
	// set: <T extends keyof Settings>(key: T, val: Settings[T]) => void
};

export const useSettings = create<Settings>()(
	persist((set) => ({
		theme: themeOptions[0],
		setTheme: (theme) => set(state => ({ ...state, theme }))
		// set: (key, val) => set(state => ({ ...state, [key]: val }))
	}), {
		name: 'crwAppSettings'
	})
);

export const AuthContext = createContext<{ login?: string, role?: string, promptLogin: (a: any) => void }>({} as any);