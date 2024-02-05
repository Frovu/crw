import { useState, useRef, useEffect, type ReactNode, type CSSProperties, type ChangeEvent, type MouseEvent, createContext, useContext } from 'react';
import { useEventListener } from './util';
import { ErrorBoundary } from 'react-error-boundary';
import { color } from './app';

function parseInput(type: 'text' | 'time' | 'number', val: string): any {
	switch (type) {
		case 'text': return val;
		case 'time': return val && new Date(val.includes(' ') ? val.replace(' ', 'T')+'Z' : val);
		case 'number': return parseFloat(val);
	}
}

export function CatchErrors({ children }: { children: ReactNode }) {
	return <ErrorBoundary  fallbackRender={({ error, resetErrorBoundary }) =>
		<div style={{ width: '100%', height: '100%' }} onMouseOver={() => resetErrorBoundary()}>
			<div className='Center' style={{ color: 'var(--color-red)' }}>
				ERROR: {error.message}
			</div>
		</div>}>
		{children}
	</ErrorBoundary>;
}

export function NumberInput({ value, onChange, min, max, step, allowNull, style }:
{ value: number | null, onChange: (a: number | null) => void, min?: number, max?: number, step?: number, allowNull?: boolean, style?: CSSProperties }) {
	const [valid, setValid] = useState(true);
	const [text, setText] = useState(value?.toString() ?? '');

	useEffect(() => setText(value?.toString() ?? ''), [value]);

	const change = (e: ChangeEvent<HTMLInputElement>) => {
		const txt = e.target.value.trim();
		const val = txt === '' ? null : parseFloat(txt);
		setText(txt);
		if (val == null && !allowNull)
			return setValid(false);
		if (val != null && !txt.match(/^(-?[0-9]+)?(\.[0-9]+)?$/))
			return setValid(false);
		if (val != null && (isNaN(val)
			|| (min != null && val < min)
			|| (max != null && val > max)))
			return setValid(false);
		setValid(true);
		onChange(val);
	};

	return <input type='text' style={{ ...style, ...(!valid && { borderColor: 'var(--color-red)' }) }}
		value={text} onChange={change}/>;
}

export function ValidatedInput({ type, value, callback, placeholder, allowEmpty }:
{ type: 'text' | 'time' | 'number', value: any, callback: (val: any) => void, placeholder?: string, allowEmpty?: boolean }) {
	const [valid, setValid] = useState(true);
	const [input, setInput] = useState(value);
	const ref = useRef<HTMLInputElement>(null);

	useEffect(() => setInput(value), [value]);

	useEventListener('keydown', (e) => {
		if (e.code === 'Escape')
			ref.current?.blur();
		if (['NumpadEnter', 'Enter'].includes(e.code))
			valid && callback(input && parseInput(type, input));
	}, ref);

	const onChange = (e: any) => {
		setInput(e.target.value);
		if (!e.target.value && allowEmpty)
			return setValid(true);
		const val = parseInput(type, e.target.value);
		if (type !== 'text' && isNaN(val))
			return setValid(false);
		setValid(true);
	};

	return <input style={{ ...(!valid && { borderColor: 'var(--color-red)' }) }} type='text' value={input || ''} placeholder={placeholder}
		ref={ref} onChange={onChange} onBlur={() => valid && callback(input && parseInput(type, input))}></input>;
}
	
export function Confirmation({ children, callback, closeSelf }:
{ children: ReactNode, closeSelf: () => void, callback: () => void }) {
	useEventListener('click', () => closeSelf());
	useEventListener('escape', () => closeSelf());
	useEventListener('keydown', (e) => {
		if (e.code === 'KeyY')
			callback();
		closeSelf();
	});
	return <>
		<div className='PopupBackground'/>
		<div className='Popup' style={{ zIndex: 130, left: '30vw', top: '20vh', maxWidth: '50vw' }} onClick={e => e.stopPropagation()}>
			{children}
			<div style={{ marginTop: '1em' }}>
				<button style={{ width: '8em' }} onClick={() => {callback(); closeSelf();}}>Confirm (Y)</button>
				<button style={{ width: '8em', marginLeft: '24px' }} onClick={() => closeSelf()}>Cancel (N)</button>
			</div>
		</div>
	</>;
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function MonthInput({ interval, callback, monthLimit }:
{ interval: [number, number], callback: (a: [number, number]) => void, monthLimit?: number }) {
	const date = new Date(interval[0] * 1e3);
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth();
	const count = Math.ceil((interval[1] - interval[0]) / 86400 / 31 );

	const commit = (y: number, m: number, c: number) =>
		callback([0, c].map(a => Date.UTC(y, m + a) / 1e3) as [number, number]);

	const set = (action: 'month'|'year'|'count', value: number) => {
		if (action === 'month') {
			commit(year, value, count);
		} else if (action === 'year') {
			commit(value, month, count);
		} else if (action === 'count') {
			commit(year, month, value);
		}
	};

	return <div style={{ display: 'inline-block' }}>
		<select onWheel={e => set('month', Math.max(0, Math.min(month + Math.sign(e.deltaY), 11)))}
			value={monthNames[month]} onChange={e => set('month', monthNames.indexOf(e.target.value))}>
			{monthNames.map(mon => <option key={mon} id={mon}>{mon}</option>)}
		</select> <input style={{ width: 68 }} type='number' min='1957' max={new Date().getFullYear()}
			value={year} onChange={e => !isNaN(e.target.valueAsNumber) && set('year', e.target.valueAsNumber)}
		/> + <input style={{ width: 48, textAlign: 'center' }} type='number' min='1' max={monthLimit}
			value={count} onChange={e => !isNaN(e.target.valueAsNumber) && set('count', e.target.valueAsNumber)}
		/> month{count === 1 ? '' : 's'}
	</div>;
}

export function useConfirmation(text: string, callback: () => void) {
	const [open, setOpen] = useState(false);

	return {
		askConfirmation: (e?: MouseEvent) => { setOpen(true); e?.stopPropagation(); },
		confirmation: !open ? null : <Confirmation {...{ callback, closeSelf: () => setOpen(false) }}>
			<h4>Confirm action</h4>
			<p>{text ?? 'Beware of irreversible consequences'}</p>
		</Confirmation>
	};
}

type SelectContextType = { value: string, onChange: (a: string) => void };
const SelectContext = createContext<SelectContextType | null>(null);

export function Select({ value, onChange, title, content, children, style }:
SelectContextType & { title?: string, style?: CSSProperties, children: ReactNode, content: ReactNode }) {

	const [isOpen, setOpen] = useState(false);
	const selRef = useRef<HTMLDivElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const close = (e: any) => {
		if (!selRef.current?.contains(e.target) && !dropdownRef.current?.contains(e.target))
			setOpen(false);
	};
	useEventListener('escape', () => setOpen(false));
	useEventListener('mousedown', close);
	useEventListener('keydown', close);
	useEventListener('contextmenu', close);

	return <SelectContext.Provider value={{ value, onChange }}>
		<div ref={selRef} className='Select' style={{ ...(isOpen && { borderColor: color('active') }), ...style }}
			onClick={() => setOpen(o => !o)}>
			{content}
			{isOpen && <div ref={dropdownRef} className='SelectDropdown' title={title} >
				{children}
			</div>}
		</div>
	</SelectContext.Provider>;
}

export function Option({ value, children, style }: { value: string, children: ReactNode, style?: CSSProperties }) {
	const context = useContext(SelectContext);
	const onChange = context?.onChange;
	const selected = value === context?.value;

	return <div className='SelectOption'
		style={{ ...style, ...(selected && { color: color('active') }) }}
		onClick={() => onChange?.(value)}>
		{children}
	</div>;
}