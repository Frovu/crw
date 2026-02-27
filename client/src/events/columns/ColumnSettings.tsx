import type { Column, ComputedColumn } from '../../api';
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

function definitionIsValid(def: string) {
	return def.length;
}

export function ColumnSettings({ column }: { column?: Column }) {
	const { columns } = useTable('feid');
	const { set, resetFocus, reset, ...state } = useColumnsState();
	const { enableColumn } = useEventsSettings();
	const [report, setReport] = useState<{ error?: string; success?: string }>({});
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
			queryClient.invalidateQueries({ queryKey: ['Tables'] });
			queryClient.invalidateQueries({ queryKey: ['tableData'] });
			set('focusColumn', col);
			set('focusStick', true);
			enableColumn(col.sql_name, true);
			setReport({ success: `Done in ${time} s` });
			logSuccess(`${targetId ? 'Modified' : 'Created'} column ${col.name} in ${time} s`);
		},
		onError: (err: any) => {
			setReport({ error: err.toString() });
			logError('generic: ' + err.toString());
		},
	});

	const inputsDisabled = !isCreating && !isModifiable;
	const definitionValid = !isDirty || definitionIsValid(value('definition'));
	const nameValid =
		!isDirty ||
		(value('name').length && !columns.find((col) => col.name === value('name') && col.sql_name !== column?.sql_name));

	return (
		<div className="relative">
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
				<div className={cn('flex gap-1 items-center', inputsDisabled && 'opacity-50')}>
					<div className="text-dark">Definition:</div>

					<Input
						disabled={inputsDisabled}
						invalid={!definitionValid}
						className="w-120 px-1 h-7"
						value={value('definition')}
						onChange={(e) => set('definition', e.target.value)}
					/>
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
		</div>
	);
}
