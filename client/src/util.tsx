import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';

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

type SetState<S> = (val: S | ((a: S) => S)) => void;

export function usePersistedState<T>(key: string, initial: (() => T) | T): [T, SetState<T>]  {
	const [state, setState] = useState<T>(() => {
		const stored = window.localStorage.getItem(key);
		try {
			if (stored) return JSON.parse(stored);
		} catch {
			console.warn('Failed to parse state: ' + key);
		}
		return typeof initial === 'function' ? (initial as any)() : initial;
	});

	const setter = useCallback<SetState<T>>((arg) => setState(prev => {
		const value = typeof arg === 'function' ? (arg as any)(prev) : arg;
		window.localStorage.setItem(key, JSON.stringify(value));
		return value;
	}), [key]);
	
	return [state, setter];
}
 
type ResizeInfo = { width: number, height: number };
export function useResizeObserver<T extends HTMLElement>(target: T | null | undefined, callback: (e: ResizeInfo) => void) {
	const savedCallback = useRef(callback);
	savedCallback.current = callback;
	
	useLayoutEffect(() => {
		if (!target) return;
		const observer = new ResizeObserver(() => {
			savedCallback.current({ width: target.offsetWidth - 2, height: target.offsetHeight - 2 });
		});
		observer.observe(target);
		return () => observer.unobserve(target);
	}, [target]);
}

export function useSize<T extends HTMLElement>(target: T | null | undefined) {
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

export function useMutationHandler(fn: (arg?: any) => Promise<any>, invalidate?: any) {
	const queryClient = useQueryClient();
	const [report, setReport] = useState<{ success?: string, error?: string } | null>(null);
	const mutation = useMutation(fn, {
		onError: (e: Error) => setReport({ error: e.message }),
		onSuccess: (res?: any) => {
			setReport({ success: res?.toString() });
			if (invalidate)
				invalidate.forEach((key: any) => queryClient.invalidateQueries([key]));
		}
	});

	useEffect(() => {
		const timeout = setTimeout(() => setReport(null), report?.success ? 5000 : 2000);
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