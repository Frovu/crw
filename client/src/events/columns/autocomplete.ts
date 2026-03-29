import getCaretCoordinates from 'textarea-caret';
import { sourceColumnOrderingOptions, sourceLinks, tablesColumns, type Function } from '../../api';
import type { useFeidInfo } from '../core/query';

export type AutocompleteHint = null | {
	left: number;
	top: number;
	opts: readonly string[];
	val: string | null;
	func?: Function;
};

export const autoCompVal = (val: string) => val.split(' ')[0];

export function trackDefinition(
	inp: HTMLInputElement | null,
	text: string,
	setText: (val: string) => void,
	setHint: (val: AutocompleteHint) => void,
	{ series, helpers, functions }: ReturnType<typeof useFeidInfo>,
	pickValue?: string,
) {
	if (!inp) return;
	if (!pickValue && !inp.matches(':focus')) return setHint(null);

	const ifPick = (genText: (val: string) => string, genPos?: (val: string) => number) => {
		if (pickValue) {
			const val = autoCompVal(pickValue);
			setText(genText(val));
			setTimeout(() => {
				const npos = genPos?.(val) ?? startPos + val.length;
				inp.focus();
				inp.setSelectionRange(npos, npos);
			});
		}
	};

	const cur = inp.selectionStart ?? 0;

	// find effective function block
	const fns = new Map<number, string>();
	let depth = 0;
	for (let i = 0; i < cur; ++i) {
		if (text[i] === '(') {
			depth += 1;
			const fname = text.slice(0, i).match(/[a-z][a-z\s]*$/)?.[0];
			fns.set(depth, fname ?? fns.get(depth - 1) ?? '');
		} else if (text[i] === ')') {
			depth -= 1;
		}
	}
	const effectiveFn = fns.get(depth) || null;

	const set = (opts: readonly string[], val: string | null, fname?: string) => {
		const fn = fname ?? effectiveFn;
		const coords = getCaretCoordinates(inp, cur);
		const left = inp.offsetLeft + coords.left;
		const top = inp.offsetTop + coords.top;
		const func = fn ? { ...functions[fn], name: fn } : undefined;
		setHint({ left, top, opts, val: opts.find((o) => autoCompVal(o) === val) ? val : null, func });
	};

	const textBefore = text.slice(0, cur);
	const stringPos = textBefore.search(/[a-zA-Z][a-zA-Z\d_]*\s*$/);
	const quotNum = textBefore.split('"').length - 1;
	const startPos = stringPos >= 0 ? stringPos : cur;
	const endFound = text.slice(startPos).search(/[^a-zA-Z\d_]/);
	const endPos = endFound >= 0 ? endFound : text.length;
	const sval = text.slice(startPos, startPos + endPos);

	if (text[startPos - 1] === '@') {
		// helpers autocomplete
		const opts = Object.keys(helpers);

		ifPick((val) => text.slice(0, startPos - 1) + '@' + val + text.slice(startPos + endPos));

		return set(opts, sval);
	}

	if (text[startPos - 1] === '$') {
		// series autocomplete
		const opts = series
			.map((s) => `${s.name} (${s.display_name})`)
			.filter((s) => !sval || autoCompVal(s).startsWith(sval[0].toLowerCase()));

		ifPick((val) => text.slice(0, startPos - 1) + '$' + val + text.slice(startPos + endPos));

		return set(opts, sval);
	}

	if (stringPos >= 0 && quotNum % 2 !== 1) {
		// function call autocomplete
		const opts = Object.keys(functions).filter((o) => o.startsWith(sval[0]));

		ifPick((val) => text.slice(0, startPos) + val + '(' + text.slice(startPos + endPos + 1));

		return set(opts, sval, functions[sval] && sval);
	}

	// function arg autocomplete

	const lpar = text.lastIndexOf('(', cur - 1);
	const ll = Math.max(lpar, text.lastIndexOf(',', cur - 1));
	const rcom = text.indexOf(',', cur);
	const rpa = rcom >= 0 ? rcom : text.indexOf(')', cur);
	const rr = rpa >= 0 ? rpa : text.length;

	if (ll < 0 || text.slice(0, rr).lastIndexOf(')') > ll) return set([], null);

	const fn = text
		.slice(0, lpar)
		.match(/[a-z\s]*$/)?.[0]
		?.trim();
	const argNum = Math.floor((text.slice(lpar, cur - 1).split('"').length - 1) / 2);
	const val = text
		.slice(ll + 1, rr)
		.trim()
		.slice(1, -1);

	if (!['scol', 'scnt'].includes(fn as any) || (fn === 'scnt' && argNum !== 0) || argNum === 2) return set([], null);

	const opts =
		argNum === 0
			? ['erupt', 'ch', ...Object.keys(sourceLinks)]
			: argNum === 3
				? sourceColumnOrderingOptions
				: (() => {
						const arg = text
							.slice(lpar + 1, text.indexOf(','))
							.trim()
							.slice(1, -1);
						const entity = arg === 'ch' ? 'sources_ch' : arg === 'erupt' ? 'sources_erupt' : arg;
						return tablesColumns[entity as keyof typeof tablesColumns] ?? [];
					})();

	ifPick(
		(val) => text.slice(0, ll + 1) + '"' + val + '"' + text.slice(rr),
		() => {
			const ncom = inp.value.indexOf(',', ll + 1);
			return ncom >= 0 ? ncom : inp.value.indexOf(')', ll);
		},
	);

	set(opts, val, fn);
}
