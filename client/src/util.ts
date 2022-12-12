import React, { useEffect, useRef } from 'react';

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