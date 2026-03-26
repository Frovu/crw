import getCaretCoordinates from 'textarea-caret';
import { sourceColumnOrderingOptions, sourceLinks, tablesColumns } from '../../api';
import type { useFeidInfo } from '../core/query';

export type AutocompleteHint = null | { left: number; top: number; opts: readonly string[]; val: string | null };

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

	const set = (opts: readonly string[], val: string | null) => {
		const coords = getCaretCoordinates(inp, cur);
		const left = inp.offsetLeft + coords.left;
		const top = inp.offsetTop + coords.top;
		setHint({ left, top, opts, val: opts.find((o) => autoCompVal(o) === val) ? val : null });
	};

	const cur = inp.selectionStart ?? 0;

	const textBefore = text.slice(0, cur);
	const stringPos = textBefore.search(/[a-zA-Z\d_]+\s*$/);
	const quotNum = textBefore.split('"').length - 1;
	const startPos = stringPos >= 0 ? stringPos : cur;
	const endFound = text.slice(startPos).search(/[^a-zA-Z\d_]*$/);
	const endPos = endFound >= 0 ? endFound : text.length;
	const sval = text.slice(startPos, startPos + endPos);

	if (text[startPos - 1] === '@') {
		// helpers autocomplete
	}

	if (text[startPos - 1] === '$') {
		// series autocomplete
		const opts = series
			.map((s) => `${s.name} (${s.display_name})`)
			.filter((s) => !sval || autoCompVal(s).startsWith(sval[0].toLowerCase()));

		if (pickValue) {
			const newText = text.slice(0, startPos - 1) + '$' + autoCompVal(pickValue) + text.slice(startPos + endPos);
			setText(newText);
			setTimeout(() => {
				const npos = startPos + autoCompVal(pickValue).length;
				inp.focus();
				inp.setSelectionRange(npos, npos);
			});
		}

		console.log('set', sval);

		return set(opts, sval);
	}

	if (stringPos >= 0 && quotNum % 2 !== 1) {
		// function call autocomplete
	}

	// check for function arg autocomplete

	const lpar = text.lastIndexOf('(', cur - 1);
	const ll = Math.max(lpar, text.lastIndexOf(',', cur - 1));
	const rcom = text.indexOf(',', cur);
	const rr = rcom >= 0 ? rcom : text.indexOf(')', cur);

	if (ll < 0 || rr < 0) return setHint(null);

	const fn = text
		.slice(0, lpar)
		.match(/[a-z\s]+$/)
		?.at(0)
		?.trim();
	const argNum = Math.floor((text.slice(lpar, cur - 1).split('"').length - 1) / 2);
	const val = text
		.slice(ll + 1, rr)
		.trim()
		.slice(1, -1);

	if (!['scol', 'scnt'].includes(fn as any) || (fn === 'scnt' && argNum !== 0) || argNum === 2) return setHint(null);

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

	if (pickValue) {
		const newText = text.slice(0, ll + 1) + '"' + pickValue + '"' + text.slice(rr);
		setText(newText);
		setTimeout(() => {
			const ncom = inp.value.indexOf(',', ll + 1);
			const nr = ncom >= 0 ? ncom : inp.value.indexOf(')', ll);
			inp.focus();
			inp.setSelectionRange(nr, nr);
		});
	}

	set(opts, val);
}
