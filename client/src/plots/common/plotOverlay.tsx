import { useMemo, useRef, type RefObject } from 'react';
import { clamp, type Size } from '../../util';

export type Position = { x: number; y: number };
type DefaultPosition = (upl: uPlot, size: Size) => Position;
type PlotOverlayHandle = {
	size: RefObject<Size>;
	position: RefObject<Position | null>;
	defaultPos: DefaultPosition;
	onReady: (u: uPlot) => void;
};

export function usePlotOverlay(defaultPos: DefaultPosition): PlotOverlayHandle {
	const posRef = useRef<Position | null>(null);
	const sizeRef = useRef<Size>({ width: 0, height: 0 });
	const dragRef = useRef<{ click: Position; saved: Position } | null>(null);

	const handle = useMemo(
		() => ({
			defaultPos,
			size: sizeRef,
			position: posRef,
			onReady: (u: uPlot) => {
				const getPosition = () => posRef.current ?? defaultPos(u, sizeRef.current);
				u.root.addEventListener('mousemove', (e) => {
					if (!dragRef.current) {
						if (
							posRef.current &&
							(posRef.current?.x > u.width * devicePixelRatio - sizeRef.current.width ||
								posRef.current?.y > u.height * devicePixelRatio - sizeRef.current.height)
						) {
							posRef.current = null;
							u.redraw();
						}
						return;
					}

					const rect = u.root.getBoundingClientRect();
					const { saved, click } = dragRef.current;
					const dx = (e.clientX - rect.left) * devicePixelRatio - click.x;
					const dy = (e.clientY - rect.top) * devicePixelRatio - click.y;
					const { width, height } = sizeRef.current;
					posRef.current = {
						x: clamp(2, u.width * devicePixelRatio - width - 1, saved.x + dx),
						y: clamp(2, u.height * devicePixelRatio - height - 1, saved.y + dy),
					};
					u.redraw();
				});
				u.root.addEventListener('mousedown', (e) => {
					const rect = u.root.getBoundingClientRect();
					const x = (e.clientX - rect.left) * devicePixelRatio;
					const y = (e.clientY - rect.top) * devicePixelRatio;
					const pos = getPosition();
					const { width, height } = sizeRef.current;
					if (x! >= pos.x && x! <= pos.x + width && y! >= pos.y && y! <= pos.y + height) {
						dragRef.current = { saved: { ...pos }, click: { x, y } };
					}
				});
				u.root.addEventListener('mouseleave', (e) => {
					dragRef.current = null;
				});
				u.root.addEventListener('mouseup', (e) => {
					dragRef.current = null;
				});
			},
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}),
		[],
	);

	return handle;
}
