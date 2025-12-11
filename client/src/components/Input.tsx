import { useEffect, useState, type ChangeEvent, type ComponentProps } from 'react';
import { cn } from '../util';
import { useEventsSettings } from '../events/core/util';

const cls =
	'bg-input-bg text-center w-40 focus:outline-none focus:ring ring-active disabled:text-dark disabled:cursor-not-allowed';

type InputProps = ComponentProps<'input'> & {
	invalid?: boolean;
};

export function Input({ className, invalid, ...props }: InputProps) {
	return <input className={cn(cls, invalid && 'ring ring-red', className)} {...props} />;
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

export function NumberInput<NULL extends boolean | undefined = true>({
	value,
	onChange,
	min,
	max,
	allowNull,
	...props
}: {
	value: NULL extends true ? number | null : number;
	min?: number;
	max?: number;
	onChange: (val: NULL extends true ? number | null : number) => void;
	allowNull?: NULL;
} & Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'min' | 'max'>) {
	const [valid, setValid] = useState(true);
	const [text, setText] = useState(value?.toString() ?? '');

	useEffect(() => setText(value?.toString() ?? ''), [value]);

	const change = (e: ChangeEvent<HTMLInputElement>) => {
		const txt = e.target.value.trim();
		const val = txt === '' ? null : parseFloat(txt);
		setText(txt);
		if (val == null && !allowNull) return setValid(false);
		if (val != null && !txt.match(/^(-?[0-9]+)?(\.[0-9]+)?$/)) return setValid(false);
		if (val != null && (isNaN(val) || (min != null && val < min) || (max != null && val > max))) return setValid(false);
		setValid(true);
		onChange(val as number);
	};

	return (
		<Input
			{...props}
			type="text"
			className={cn(!valid && 'ring-red text-red', props.className)}
			value={text}
			onChange={change}
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
