import { useState, useRef, useEffect } from 'react';
import { cn, useEventListener } from '../util';
import { Input } from './Input';

function parseInput(type: 'text' | 'time' | 'number', val: string): any {
	switch (type) {
		case 'text':
			return val;
		case 'time':
			return val && new Date(val.includes(' ') ? val.replace(' ', 'T') + 'Z' : val);
		case 'number':
			return parseFloat(val);
	}
}

export function ValidatedInput({
	type,
	value,
	callback,
	placeholder,
	allowEmpty,
}: {
	type: 'text' | 'time' | 'number';
	value: any;
	callback: (val: any) => void;
	placeholder?: string;
	allowEmpty?: boolean;
}) {
	const [valid, setValid] = useState(true);
	const [input, setInput] = useState(value);
	const ref = useRef<HTMLInputElement | null>(null);

	useEffect(() => setInput(value), [value]);

	useEventListener(
		'keydown',
		(e) => {
			if (e.code === 'Escape') ref.current?.blur();
			if (['NumpadEnter', 'Enter'].includes(e.code)) valid && callback(input && parseInput(type, input));
		},
		ref,
	);

	const onChange = (e: any) => {
		setInput(e.target.value);
		if (!e.target.value && allowEmpty) return setValid(true);
		const val = parseInput(type, e.target.value);
		if (type !== 'text' && isNaN(val)) return setValid(false);
		setValid(true);
	};

	const onBlur = () => {
		const val = parseInput(type, input);
		if (valid && val !== value) callback(val);
	};

	return (
		<Input
			className={cn('w-42 h-7 border-0', !valid && 'text-red')}
			value={input || ''}
			placeholder={placeholder}
			ref={ref}
			onChange={onChange}
			onBlur={onBlur}
		/>
	);
}
