import { type CSSProperties, useState, useRef, useEffect } from 'react';
import { useEventListener } from '../util';

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
	style,
}: {
	type: 'text' | 'time' | 'number';
	value: any;
	callback: (val: any) => void;
	placeholder?: string;
	allowEmpty?: boolean;
	style?: CSSProperties;
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
		ref
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
		<input
			style={{ ...(!valid && { borderColor: 'var(--color-red)' }), ...style }}
			type="text"
			value={input || ''}
			placeholder={placeholder}
			ref={ref}
			onChange={onChange}
			onBlur={onBlur}
		></input>
	);
}
