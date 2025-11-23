import { type CSSProperties, useState, useEffect, type ChangeEvent } from 'react';
import { Input } from './Input';

export function NumberInput({
	value,
	onChange,
	min,
	max,
	allowNull,
	style,
}: {
	value: number | null;
	onChange: (a: number | null) => void;
	min?: number;
	max?: number;
	allowNull?: boolean;
	style?: CSSProperties;
}) {
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
		onChange(val);
	};

	return (
		<Input
			type="text"
			style={{ ...style, ...(!valid && { borderColor: 'var(--color-red)' }) }}
			value={text}
			onChange={change}
		/>
	);
}
