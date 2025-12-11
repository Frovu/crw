import type { Column, ComputedColumn } from '../../api';
import { Input } from '../../components/Input';
import { Checkbox } from '../../components/Checkbox';
import { Button } from '../../components/Button';
import { cn } from '../../util';
import { useColumnsState, type ColumnInputs } from './columns';
import { useTable } from '../core/editableTables';

function definitionIsValid(def: string) {
	return def.length;
}

export function ColumnSettings({ column }: { column?: Column }) {
	const { columns } = useTable('feid');
	const { set, resetFocus, reset, ...state } = useColumnsState();

	const value = <K extends ColumnInputs>(k: K) => (column as ComputedColumn)?.[k] ?? state[k];

	const isDirty = state.isDirty();
	const isCreating = !column;
	const isComputed = column?.type === 'computed';
	const isModifiable = column?.type === 'computed' && column.is_own;

	const inputsDisabled = !isCreating && !isModifiable;
	const definitionValid = !isDirty || definitionIsValid(value('definition'));
	const nameValid =
		!isDirty ||
		(value('name').length && !columns.find((col) => col.name === value('name') && col.sql_name !== column?.sql_name));

	return (
		<div>
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
					className="w-120 h-7 text-left pl-2"
					value={value('description') ?? ''}
					onChange={(e) => set('description', e.target.value)}
				/>
				{isModifiable && (
					<Button variant="default" className="ml-1 bg-input-bg w-38 h-7">
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
					variant="default"
					className="ml-1 bg-input-bg w-38 h-7"
					onClick={() => {
						if (!isDirty) {
							reset();
							queueMicrotask(() => {
								document.getElementById('colNameInput')?.focus();
							});
						}
					}}
				>
					{isDirty ? 'Create column' : 'New column'}
				</Button>
			</div>
		</div>
	);
}
