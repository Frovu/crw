import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Input, TextInput, type TextInputProps } from '../../components/Input';
import { cn } from '../../util';
import { autoCompVal, trackDefinition, type AutocompleteHint } from './autocomplete';
import { RefFunctionView } from './CompColumnsReference';
import { useFeidInfo } from '../core/query';

export function AutocompleteView({ hint, onPick }: { hint: AutocompleteHint; onPick: (val: string) => void }) {
	return (
		<>
			{hint && hint.opts.length > 0 && (
				<div
					className="absolute max-h-100 overflow-y-scroll border z-20 bg-bg rounded-xl flex flex-col py-1 -translate-y-full [@media(max-height:700px)]:-translate-x-full"
					style={{ left: hint.left, top: hint.top - 8 }}
				>
					{hint.opts.map((opt) => (
						<Button
							key={opt}
							className={cn(
								'px-3 py-0.5',
								hint.val && 'text-dark',
								opt.split(' ')[0] === hint.val && 'text-active',
							)}
							onMouseDown={() => onPick(opt)}
						>
							{opt}
						</Button>
					))}
				</div>
			)}
			{hint?.func?.args && (
				<div
					className="absolute border z-20 bg-bg p-2 text-left rounded-xl w-max max-w-[560px] [@media(max-height:700px)]:-translate-y-full [@media(max-height:700px)]:translate-x-[24px]"
					style={{ left: hint.left, top: hint.top + 38 }}
				>
					<RefFunctionView {...hint.func} />
				</div>
			)}
		</>
	);
}

export function DefinitionInput({
	value,
	onChange,
	submitMode,
	...props
}: Omit<TextInputProps, 'onChange' | 'onSubmit'> & { onChange: (val: string) => void; submitMode?: boolean }) {
	const inpRef = useRef<HTMLInputElement>(null);
	const [hint, setHint] = useState<AutocompleteHint>(null);
	const [input, setInput] = useState(value);

	useEffect(() => setInput(value), [value]);

	const feidInfo = useFeidInfo();

	const trackDef = (setVal?: string) => trackDefinition(inpRef.current, input, setInput, setHint, feidInfo, setVal);

	return (
		<div>
			{hint && <AutocompleteView hint={hint} onPick={trackDef} />}
			<Input
				ref={inpRef}
				value={input}
				onChange={(e) => {
					setInput(e.target.value);
					if (!submitMode) onChange(e.target.value);
				}}
				onBlur={(e) => {
					onChange(e.target.value);
					trackDef();
				}}
				{...props}
				onKeyDown={(e) => {
					if (['Enter', 'NumpadEnter'].includes(e.code)) {
						(e.target as any).blur?.();
						e.stopPropagation();
						return;
					}
					const diff = {
						ArrowUp: -1,
						ArrowDown: 1,
					}[e.key];
					const opts = hint?.opts;
					if (!opts?.length || !diff) return;
					const next = opts.at(
						(opts.length + opts.findIndex((o) => autoCompVal(o) === hint?.val) + diff) % opts.length,
					);
					e.stopPropagation();
					e.preventDefault();
					trackDef(next);
				}}
				onKeyUp={() => trackDef()}
				onClick={() => trackDef()}
			/>
		</div>
	);
}
