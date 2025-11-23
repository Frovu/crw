import type { ComponentProps } from 'react';
import { cn, useEventListener } from '../util';

type Props = {
	onClose: () => void;
} & ComponentProps<'div'>;

export function Popup({ onClose, className, children, ...props }: Props) {
	useEventListener('escape', onClose);

	return (
		<div className="bg-bg/80 fixed top-0 left-0 w-screen h-screen z-10" onClick={onClose}>
			<div
				className={cn('bg-bg border-2 p-1 w-100 fixed left-1/4 top-1/4 text-center overflow-clip', className)}
				onClick={(e) => e.stopPropagation()}
				{...props}
			>
				{children}
			</div>
		</div>
	);
}
