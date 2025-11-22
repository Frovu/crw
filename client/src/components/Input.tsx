import type { ComponentProps } from 'react';
import { cn } from '../util';

const cls = 'border text-center focus:outline-none focus:border-active';

export function Input({ className, ...props }: ComponentProps<'input'>) {
	return <input className={cn(cls, className)} {...props} />;
}
