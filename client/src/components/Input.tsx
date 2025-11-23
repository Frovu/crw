import { useEffect, useState, type ComponentProps } from 'react';
import { cn } from '../util';
import { useEventsSettings } from '../events/core/util';

const cls =
	'bg-input-bg text-center w-40 focus:outline-none focus:ring ring-active disabled:text-dark disabled:cursor-not-allowed';

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

export function PlotIntervalInput({ step: alterStep, solar }: { step?: number; solar?: boolean }) {
	const { plotOffset, plotOffsetSolar, set } = useEventsSettings();
	const target = solar ? 'plotOffsetSolar' : 'plotOffset';
	const [left, right] = solar ? plotOffsetSolar : plotOffset;
	const step = alterStep ?? (solar ? 6 : 24);

	return (
		<div className="flex gap-1" title="Plot time interval as hours offset from the event onset">
			Interval:
			<Input
				className="w-15"
				type="number"
				min="-360"
				max="0"
				step={step}
				defaultValue={left}
				onChange={(e) => !isNaN(e.target.valueAsNumber) && set(target, [e.target.valueAsNumber, right])}
			/>
			/
			<Input
				className="w-14"
				type="number"
				min={step}
				max="360"
				step={step}
				defaultValue={right}
				onChange={(e) => !isNaN(e.target.valueAsNumber) && set(target, [left, e.target.valueAsNumber])}
			/>
			h
		</div>
	);
}
