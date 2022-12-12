import { useEffect, useRef } from 'react';

export function dispatch(eventName: string, detail?: {}) {
	document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

export function useEventListener(eventName: string, callback: (e: CustomEvent) => any | (() => any)) {
	const savedCallback = useRef(callback);
	useEffect(() => { savedCallback.current = callback; }, [callback]);

	useEffect(() => {
		const listener: typeof callback = (e) => savedCallback.current(e);
		document.addEventListener(eventName, listener as any);
		return () => document.removeEventListener(eventName, listener as any);
	}, [eventName]);
}