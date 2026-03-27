import { Button } from '../../components/Button';
import { cn } from '../../util';
import type { AutocompleteHint } from './autocomplete';
import { RefFunctionView } from './CompColumnsReference';

export default function AutocompleteView({ hint, onPick }: { hint: AutocompleteHint; onPick: (val: string) => void }) {
	return (
		<>
			{hint && (
				<div
					className="absolute max-h-100 overflow-y-scroll border rounded-xl flex flex-col py-1 -translate-y-full z-20 bg-bg"
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
			{hint?.func && (
				<div className="absolute border z-20 bg-bg p-2 text-left rounded-xl" style={{ right: 0, top: hint.top + 38 }}>
					<RefFunctionView {...hint.func} />
				</div>
			)}
		</>
	);
}
