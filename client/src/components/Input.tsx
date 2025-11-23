import { useEffect, useState, type ComponentProps } from 'react';
import { cn } from '../util';

const cls = 'border text-center w-40 focus:outline-none focus:border-active disabled:text-dark disabled:cursor-not-allowed';

export function Input({ className, ...props }: ComponentProps<'input'>) {
	return <input className={cn(cls, className)} {...props} />;
}

type TextInputProps = {
	value: string;
	onSubmit?: (val: string) => void;
} & Omit<ComponentProps<'input'>, 'value' | 'onSubmit'>;

export function TextInput({ value, onSubmit, onChange, onKeyDown, ...props }: TextInputProps) {
	const [input, setInput] = useState(value);

	useEffect(() => setInput(value), [value]);

	return (
		<Input
			value={input}
			onChange={(e) => {
				setInput(e.target.value);
				onChange?.(e);
			}}
			type="text"
			onKeyDown={(e) => {
				['Enter', 'NumpadEnter'].includes(e.code) && (e.target as any).blur?.();
				onKeyDown?.(e);
			}}
			onBlur={() => onSubmit?.(input)}
			{...props}
		/>
	);
}
