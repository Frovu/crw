import type { ComponentProps } from 'react';
import { cn } from '../util';

const variants = {
	text: 'border-none hover:underline',
} as const;

export function Button(props: ComponentProps<'button'> & { variant?: keyof typeof variants }) {
	const cls = 'cursor-pointer hover:text-active hover:active:text-active/80';
	return <button {...props} className={cn(cls, variants[props.variant ?? 'text'], props.className)} />;
}

export function CloseButton(props: ComponentProps<'button'>) {
	const cls = 'relative text-red text-2xl cursor-pointer hover:text-active hover:active:text-active/80';
	return (
		<button {...props} className={cn(cls, props.className)}>
			<div className="absolute -top-5.5">×</div>
		</button>
	);
}
