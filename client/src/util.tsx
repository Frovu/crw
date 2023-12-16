import React, { MouseEvent, ReactElement, ReactNode, Reducer, SetStateAction, useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';

export type Size = { width: number, height: number };

export function prettyDate(inp: Date | number | null, short=false) {
	if (inp == null) return 'N/A';
	const date = inp instanceof Date ? inp : new Date(1e3 * inp);
	return isNaN(date.getTime()) ? 'Invalid' : date.toISOString().replace('T', ' ').replace(short ? /\s.*/ : /(:00)?\..*/, '');
}

export const clamp = (min: number, max: number, val: number, minFirst: boolean=false) =>
	minFirst ? Math.min(max, Math.max(min, val)) : Math.max(min, Math.min(max, val));

export async function apiPost<T = { message?: string }>(url: string, body?: { [k: string]: any }): Promise<T> {
	const res = await fetch(process.env.REACT_APP_API + 'api/' + url, {
		method: 'POST', credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		body: body && JSON.stringify(body)
	});
	const json = await res.json();
	if (res.status !== 200)
		throw new Error(json.message ?? ('HTTP '+res.status));
	return json;
}
export async function apiGet<T = { message?: string }>(url: string, query?: { [k: string]: any }): Promise<T> {
	let uri = process.env.REACT_APP_API + 'api/' + url;
	if (query)
		uri += '?' + new URLSearchParams(query).toString();
	const res = await fetch(uri, { credentials: 'include' });
	const json = await res.json();
	if (res.status !== 200)
		throw new Error(json.message ?? ('HTTP '+res.status));
	return json;
}

export function dispatchCustomEvent(eventName: string, detail?: {}) {
	document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

export function useEventListener(eventName: string, callback: (e: any) => any | (() => any), elementRef?: React.RefObject<HTMLElement>) {
	const savedCallback = useRef(callback);
	savedCallback.current = callback;

	useEffect(() => {
		const listener: typeof callback = (e) => savedCallback.current(e);
		const target = elementRef?.current ?? document; 
		target.addEventListener(eventName, listener as any);
		return () => target.removeEventListener(eventName, listener as any);
	}, [elementRef, eventName]);
}

export function usePersistedState<T>(key: string, initial: (() => T) | T): [T, (a: SetStateAction<T>) => void]  {
	const [state, setState] = useState<T>(() => {
		const stored = window.localStorage.getItem(key);
		const def = typeof initial === 'function' ? (initial as any)() : initial;
		try {
			return { ...def, ...(stored && JSON.parse(stored)) };
		} catch {
			console.warn('Failed to parse state: ' + key);
			return def;
		}
	});

	const setter = useCallback((arg: SetStateAction<T>) => setState(prev => {
		const value = typeof arg === 'function' ? (arg as any)(prev) : arg;
		window.localStorage.setItem(key, JSON.stringify(value));
		return value;
	}), [key]);
	
	return [state, setter];
}
 
type ResizeInfo = { width: number, height: number };
export function useResizeObserver<T extends Element>(target: T | null | undefined, callback: (e: ResizeInfo) => void) {
	const savedCallback = useRef(callback);
	savedCallback.current = callback;
	
	useLayoutEffect(() => {
		if (!target) return;
		const observer = new ResizeObserver(() => {
			savedCallback.current({ width: target.clientWidth, height: target.clientHeight });
		});
		observer.observe(target);
		return () => observer.unobserve(target);
	}, [target]);
}

export function useSize<T extends Element>(target: T | null | undefined) {
	const [ size, setSize ] = useState({ width: 0, height: 0 });

	useResizeObserver(target, newSize => {
		setSize(oldSize => {
			if (oldSize.width !== newSize.width || oldSize.height !== newSize.height)
				return newSize;
			return oldSize;
		});
	});

	return size;
}

export function useMutationHandler<F extends (...args: any) => Promise<any>>(fn: F, invalidate?: string[]) {
	const queryClient = useQueryClient();
	const [report, setReport] = useState<{ success?: string, error?: string } | null>(null);
	type V = Parameters<F>[number];
	const mutation = useMutation<Awaited<ReturnType<F>>, Error, [V] extends [never] ? any : V>(fn, {
		onError: (e: Error) => setReport({ error: e.message }),
		onSuccess: (res: Awaited<ReturnType<F>>) => {
			setReport({ success: res.message?.toString() });
			if (invalidate)
				invalidate.forEach(key => queryClient.invalidateQueries([key]));
		}
	});

	useEffect(() => {
		const timeout = setTimeout(() => setReport(null), report?.success ? 15000 : 5000);
		return () => clearTimeout(timeout);
	}, [report]);

	return {
		...mutation,
		report, setReport,
		color: mutation.isLoading ? 'var(--color-text)' : report?.success ? 'var(--color-green)' : report?.error ? 'var(--color-red)' : 'var(--color-text)'
	};
}

function parseInput(type: 'text' | 'time' | 'number', val: string): any {
	switch (type) {
		case 'text': return val;
		case 'time': return val && new Date(val.includes(' ') ? val.replace(' ', 'T')+'Z' : val);
		case 'number': return parseFloat(val);
	}
}

export function ValidatedInput({ type, value, callback, placeholder, allowEmpty }:
{ type: 'text' | 'time' | 'number', value: any, callback: (val: any) => void, placeholder?: string, allowEmpty?: boolean }) {
	const [valid, setValid] = useState(true);
	const [input, setInput] = useState(value);
	const ref = useRef<HTMLInputElement>(null);

	useEffect(() => setInput(value), [value]);

	useEventListener('keydown', (e) => {
		if (e.code === 'Escape')
			ref.current?.blur();
		if (['NumpadEnter', 'Enter'].includes(e.code))
			valid && callback(input && parseInput(type, input));
	}, ref);

	const onChange = (e: any) => {
		setInput(e.target.value);
		if (!e.target.value && allowEmpty)
			return setValid(true);
		const val = parseInput(type, e.target.value);
		if (type !== 'text' && isNaN(val))
			return setValid(false);
		setValid(true);
	};

	return <input style={{ ...(!valid && { borderColor: 'var(--color-red)' }) }} type='text' value={input || ''} placeholder={placeholder}
		ref={ref} onChange={onChange} onBlur={() => valid && callback(input && parseInput(type, input))}></input>;
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function useMonthInput(initial?: Date, initialMonths?: number, maxMonths?: number) {
	type R = Reducer<{ year: number, month: number, count: number, interval: number[]}, { action: 'month'|'year'|'count', value: number }>;
	const init = initial ?? new Date();
	const [{ year, month, count, interval }, dispatch] = useReducer<R>((state, { action, value }) => {
		const st = { ...state, [action]: value };
		st.interval = [0, st.count].map(inc => new Date(Date.UTC(st.year, st.month + inc)).getTime() / 1e3);
		return st;
	}, {
		year: init.getFullYear(),
		month: init.getMonth(),
		count: initialMonths ?? 1,
		interval: [0, initialMonths ?? 1].map(inc => new Date(Date.UTC(init.getFullYear(), init.getMonth() + inc)).getTime() / 1e3)
	});
	const set = (action: 'month'|'year'|'count', value: number) => dispatch({ action, value });

	return [interval, <div style={{ display: 'inline-block' }}>
		<select onWheel={e => set('month', Math.max(0, Math.min(month + Math.sign(e.deltaY), 11)))}
			value={monthNames[month]} onChange={e => set('month', monthNames.indexOf(e.target.value))}>
			{monthNames.map(mon => <option key={mon} id={mon}>{mon}</option>)}
		</select> <input style={{ width: 68 }} type='number' min='1957' max={new Date().getFullYear()}
			value={year} onChange={e => !isNaN(e.target.valueAsNumber) && set('year', e.target.valueAsNumber)}
		/> + <input style={{ width: 48, textAlign: 'center' }} type='number' min='1' max={maxMonths ?? 24}
			value={count} onChange={e => !isNaN(e.target.valueAsNumber) && set('count', e.target.valueAsNumber)}
		/> month{count === 1 ? '' : 's'}
	</div>] as [number[], ReactElement];
}

export function Confirmation({ children, callback, closeSelf }:
{ children: ReactNode, closeSelf: () => void, callback: () => void }) {
	useEventListener('click', () => closeSelf());
	useEventListener('escape', () => closeSelf());
	useEventListener('keydown', (e) => {
		if (e.code === 'KeyY')
			callback();
		closeSelf();
	});
	return <>
		<div className='PopupBackground'/>
		<div className='Popup' style={{ zIndex: 130, left: '30vw', top: '20vh', maxWidth: '50vw' }} onClick={e => e.stopPropagation()}>
			{children}
			<div style={{ marginTop: '1em' }}>
				<button style={{ width: '8em' }} onClick={() => {callback(); closeSelf();}}>Confirm (Y)</button>
				<button style={{ width: '8em', marginLeft: '24px' }} onClick={() => closeSelf()}>Cancel (N)</button>
			</div>
		</div>
	</>;
}

export function useConfirmation(text: string, callback: () => void) {
	const [open, setOpen] = useState(false);

	return {
		askConfirmation: (e?: MouseEvent) => { setOpen(true); e?.stopPropagation(); },
		confirmation: !open ? null : <Confirmation {...{ callback, closeSelf: () => setOpen(false) }}>
			<h4>Confirm action</h4>
			<p>{text ?? 'Beware of irreversible consequences'}</p>
		</Confirmation>
	};
}
