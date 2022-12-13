import React, { useEffect, useRef, useState } from 'react';

export function dispatch(eventName: string, detail?: {}) {
	document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

export function useEventListener(eventName: string, callback: (e: any) => any | (() => any), elementRef?: React.RefObject<HTMLElement>) {
	const savedCallback = useRef(callback);
	useEffect(() => { savedCallback.current = callback; }, [callback]);

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
	
	return [state, (arg) => setState(prev => {
		const value = typeof arg === 'function' ? (arg as (a: T) => T)(prev) : arg;
		window.localStorage.setItem(key, JSON.stringify(value));
		return value;
	})];
}