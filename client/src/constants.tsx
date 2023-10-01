import { createContext } from 'react';

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

export const AuthContext = createContext<{ login?: string, role?: string, promptLogin: (a: any) => void }>({} as any);