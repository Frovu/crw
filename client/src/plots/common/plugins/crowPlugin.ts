import { color } from '../../../app/app';
import { setCrowCursor, useCrowState } from '../../../crow/core/crowState';

export function crowPlugin(): uPlot.Plugin {
	const marker = document.createElement('canvas');
	marker.width = 2;
	marker.className = 'absolute! top-[2px]';
	marker.style.width = '2px';

	let unsub: () => void;

	return {
		opts: (_, opts) => ({
			...opts,
			cursor: {
				...opts.cursor,
				bind: {
					...opts.cursor?.bind,
					dblclick: (u, _, handler) => (e) => {
						opts.cursor?.bind?.dblclick?.(u, _, handler)?.(e);
						setCrowCursor((curs) => (!curs || !curs.lock ? null : { ...curs, lock: false }));
						handler(e);
						return null;
					},
					mousedown: (u, _, handler) => (e) => {
						opts.cursor?.bind?.mousedown?.(u, _, handler)?.(e);
						if (u.cursor.left != null && e.button == 0) {
							const val = u.posToVal(u.cursor.left, 'x');
							const time = Math.floor(val / 3600) * 3600;
							setCrowCursor(() => ({ time, lock: true }));
						}
						handler(e);
						return null;
					},
					mouseleave: (u, _, handler) => (e) => {
						opts.cursor?.bind?.mouseleave?.(u, _, handler)?.(e);
						setCrowCursor((curs) => (curs?.lock ? curs : null));
						handler(e);
						return null;
					},
				},
			},
		}),
		hooks: {
			ready: [
				(u) => {
					const setMarker = (state: ReturnType<typeof useCrowState.getState>) => {
						marker.hidden = !state.cursor;
						if (!state.cursor) return;

						const left = u.valToPos(state.cursor.time, 'x', true);
						marker.hidden = left < u.bbox.left || left > u.bbox.width + u.bbox.left;
						marker.style.left = left + 'px';
					};
					const h = u.bbox.top + u.bbox.height;
					marker.style.height = h + 'px';
					marker.height = h;
					const ctx = marker.getContext('2d')!;
					ctx.setLineDash([4, 4]);
					ctx.strokeStyle = color('white');
					ctx.lineWidth = 2;
					ctx.moveTo(1, 0);
					ctx.lineTo(1, h);
					ctx.stroke();
					u.over.parentElement!.insertBefore(marker, u.over);

					setMarker(useCrowState.getState());
					unsub = useCrowState.subscribe(setMarker);
				},
			],
			destroy: [
				() => {
					marker.parentElement?.removeChild(marker);
					unsub?.();
				},
			],
			setCursor: [
				(u) => {
					if (u.cursor.left == null || u.cursor.left < 0) return;
					const val = u.posToVal(u.cursor.left, 'x');
					const time = Math.floor(val / 3600) * 3600;
					setCrowCursor((curs) => (curs?.lock ? curs : { time, lock: false }));
				},
			],
		},
	};
}
