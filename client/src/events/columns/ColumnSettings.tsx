import { sourceColumnOrderingOptions, sourceLinks, tablesColumns, type Column, type ComputedColumn } from '../../api';
import { Input } from '../../components/Input';
import { Checkbox } from '../../components/Checkbox';
import { Button } from '../../components/Button';
import { apiPost, cn } from '../../util';
import { useColumnsState, type ColumnInputs } from './columns';
import { useTable } from '../core/editableTables';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { logSuccess, logError } from '../../app';
import { useState } from 'react';
import { useEventsSettings } from '../core/util';
import { Library } from 'lucide-react';
import CompColumnsReference from './CompColumnsReference';
import { Popup } from '../../components/Popup';
import getCaretCoordinates from 'textarea-caret';

export function ColumnSettings({ column }: { column?: Column }) {
	const { columns } = useTable('feid');
	const { set, resetFocus, reset, ...state } = useColumnsState();
	const { enableColumn } = useEventsSettings();
	const [report, setReport] = useState<{ error?: string; success?: string }>({});
	const [infoOpen, setInfoOpen] = useState(false);
	const [inp, setDefInput] = useState<HTMLInputElement | null>();
	const [hint, setHint] = useState<null | { left: number; top: number; opts: readonly string[]; val: string | null }>();
	const queryClient = useQueryClient();

	const isDirty = state.isDirty();
	const value = <K extends ColumnInputs>(k: K) => state[k];

	const targetId = column?.type === 'computed' ? column.id : null;
	const isCreating = !column;
	const isComputed = column?.type === 'computed';
	const isModifiable = column?.type === 'computed' && column.is_own;

	const { mutate: upsertGeneric, isPending: loadingUpsert } = useMutation({
		mutationFn: (modify: boolean) => {
			const url = 'events/columns' + (modify && targetId ? `/${targetId}` : '');
			const { name, description, definition, is_public } = state;
			return apiPost<{ column: ComputedColumn; time: number }>(url, {
				name,
				description,
				definition,
				is_public,
			});
		},
		onSuccess: ({ column: col, time }) => {
			queryClient.invalidateQueries({ queryKey: ['tableData'] });
			set('focusColumn', col);
			set('focusStick', true);
			setTimeout(() => enableColumn(col.sql_name, true), 500);
			setReport({ success: `Done in ${time} s` });
			logSuccess(`${targetId ? 'Modified' : 'Created'} column ${col.name} in ${time} s`);
		},
		onError: (err: any) => {
			setReport({ error: err.toString() });
			logError('generic: ' + err.toString());
		},
	});

	function trackDefinition(setValue?: string) {
		if (!inp) return;
		if (!setValue && !inp.matches(':focus')) return setHint(null);

		const cur = inp.selectionStart ?? 0;
		const text = value('definition');
		const lpar = text.lastIndexOf('(', cur - 1);
		const ll = Math.max(lpar, text.lastIndexOf(',', cur - 1));
		const rcom = text.indexOf(',', cur);
		const rr = rcom >= 0 ? rcom : text.indexOf(')', cur);

		if (ll < 0 || rr < 0) return setHint(null);

		const fn = text
			.slice(0, lpar)
			.match(/[a-z\s]+$/)
			?.at(0)
			?.trim();
		const argNum = Math.floor((text.slice(lpar, cur - 1).split('"').length - 1) / 2);
		const val = text
			.slice(ll + 1, rr)
			.trim()
			.slice(1, -1);

		if (!['scol', 'scnt'].includes(fn as any) || (fn === 'scnt' && argNum !== 0) || argNum === 2) return setHint(null);

		const opts =
			argNum === 0
				? ['erupt', 'ch', ...Object.keys(sourceLinks)]
				: argNum === 3
					? sourceColumnOrderingOptions
					: (() => {
							const arg = text
								.slice(lpar + 1, text.indexOf(','))
								.trim()
								.slice(1, -1);
							const entity = arg === 'ch' ? 'sources_ch' : arg === 'erupt' ? 'sources_erupt' : arg;
							console.log(arg, entity);
							return tablesColumns[entity as keyof typeof tablesColumns] ?? [];
						})();

		if (setValue) {
			const newText = text.slice(0, ll + 1) + '"' + setValue + '"' + text.slice(rr);
			set('definition', newText);
			setTimeout(() => {
				const ncom = inp.value.indexOf(',', ll + 1);
				const nr = ncom >= 0 ? ncom : inp.value.indexOf(')', ll);
				console.log(nr, inp.selectionStart, inp.matches(':focus'));
				inp.focus();
				inp.setSelectionRange(nr, nr);
			});
		}

		const coords = getCaretCoordinates(inp, cur);
		const left = inp.offsetLeft + coords.left;
		const top = inp.offsetTop + coords.top;
		setHint({ left, top, opts, val: (opts as any).includes(val) ? val : null });
	}

	const inputsDisabled = !isCreating && !isModifiable;
	const defValid = !isDirty || (value('definition') && (!hint || hint.val));
	const nameValid =
		!isDirty ||
		(value('name').length && !columns.find((col) => col.name === value('name') && col.sql_name !== column?.sql_name));

	return (
		<div
			className="relative"
			onKeyDown={(e) => {
				if (isDirty && targetId && ['Enter', 'NumpadEnter'].includes(e.key)) upsertGeneric(true);
			}}
		>
			{hint && (
				<div
					className="absolute max-h-100 overflow-y-scroll border rounded-xl flex flex-col py-1 -translate-y-full z-20 bg-bg"
					style={{ left: hint.left, top: hint.top - 8 }}
				>
					{hint.opts.map((opt) => (
						<Button
							key={opt}
							className={cn('px-3 py-0.5', hint.val && 'text-dark', opt === hint.val && 'text-active')}
							onMouseDown={() => trackDefinition(opt)}
						>
							{opt}
						</Button>
					))}
				</div>
			)}
			<div
				className="absolute right-1 -top-1 max-h-18 max-w-[400px] text-left overflow-y-clip -translate-y-full"
				title={report?.error ?? report?.success}
				onClick={() => setReport({})}
			>
				{report?.error && <div className="text-red">{report.error}</div>}
				{report?.success && <div className="text-green">{report.success}</div>}
			</div>
			<div className="flex gap-1 items-center">
				<div className="text-dark">Name:</div>
				<Input
					id="colNameInput"
					className="h-7"
					disabled={inputsDisabled}
					invalid={!nameValid}
					value={value('name')}
					onChange={(e) => set('name', e.target.value)}
				/>
				<div className="text-dark pl-1">Desc:</div>

				<Input
					disabled={inputsDisabled}
					className="w-120 h-7 pl-2"
					value={value('description') ?? ''}
					onChange={(e) => set('description', e.target.value)}
				/>
				{isModifiable && isDirty && (
					<Button
						disabled={loadingUpsert}
						variant="default"
						className="ml-1 text-active bg-input-bg w-38 h-7"
						onClick={() => upsertGeneric(true)}
					>
						Modify column
					</Button>
				)}
			</div>
			<div className="flex gap-1 pt-2">
				<Checkbox
					className={cn('px-2 text-dark', !isCreating && !isComputed && 'opacity-50')}
					label="public column"
					checked={value('is_public')}
					onCheckedChange={(val) => set('is_public', val)}
					disabled={inputsDisabled}
				/>
				<div className={cn('flex items-center', inputsDisabled && 'opacity-50')}>
					<div className="text-dark pr-1">Definition:</div>
					<div className="flex gap-[1px] bg-input-bg">
						<Input
							ref={setDefInput}
							disabled={inputsDisabled}
							invalid={!defValid}
							className="w-113 px-1 h-7"
							value={value('definition')}
							onChange={(e) => set('definition', e.target.value)}
							onKeyDown={(e) => {
								const diff = {
									ArrowUp: -1,
									ArrowDown: 1,
								}[e.key];
								const opts = hint?.opts;
								if (['Enter', 'NumpadEnter'].includes(e.code)) return (e.target as any).blur?.();

								if (!opts?.length || !diff) return;

								const next = opts.at((opts.length + opts.indexOf(hint?.val ?? '') + diff) % opts.length);
								e.stopPropagation();
								e.preventDefault();

								trackDefinition(next);
							}}
							onKeyUp={() => trackDefinition()}
							onClick={() => trackDefinition()}
							onBlur={() => trackDefinition()}
						/>
						<Button
							title="Open computed columns reference"
							variant="default"
							className="bg-input-bg border-input-bg h-7 w-7"
							onClick={() => setInfoOpen(true)}
						>
							<Library size={22} className="-ml-1.5 " />
						</Button>
					</div>
				</div>
				<Button
					disabled={loadingUpsert}
					variant="default"
					className="ml-1 bg-input-bg w-38 h-7"
					onClick={() => {
						if (!isDirty) {
							reset();
							queueMicrotask(() => {
								document.getElementById('colNameInput')?.focus();
							});
						} else {
							upsertGeneric(false);
						}
					}}
				>
					{isDirty ? 'Create column' : 'New column'}
				</Button>
			</div>
			{infoOpen && (
				<Popup className="top-1 max-h-[calc(100vh-34px)] w-[760px] flex" onClose={() => setInfoOpen(false)}>
					<CompColumnsReference />
				</Popup>
			)}
		</div>
	);
}
