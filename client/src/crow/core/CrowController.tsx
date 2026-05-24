import { usePlot } from '../../events/core/plot';
import type { Interval } from '../../plots/common/types';
import { clamp, useEventListener } from '../../util';
import { setCrowCursor, useCrowState } from './crowState';

function moveCrowCursor(delta: number, { start, end }: Interval, ctrl: boolean) {
	useCrowState.setState(({ cursor }) => {
		if (!cursor?.lock) return;
		const hours = (end - start) / 3600;
		const move = ctrl ? delta * Math.round(hours / 20) : delta;
		cursor.time = clamp(start, end - 3600, cursor.time + move * 3600);
		console.log('set crow cursor', new Date(cursor.time * 1e3).toISOString());
	});
}

export default function CrowController() {
	const { interval } = usePlot();

	useEventListener('escape', () => setCrowCursor(() => null));
	useEventListener('keydown', (e: KeyboardEvent) => {
		const delta = { ArrowLeft: -1, ArrowRight: 1, Home: -9999, End: 9999 }[e.key];
		if (delta && interval) moveCrowCursor(delta, interval, e.ctrlKey);
	});

	return null;
}
