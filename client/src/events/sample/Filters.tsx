import { useState } from 'react';
import { type Filter, filterOperations } from '../../api';
import { CloseButton } from '../../components/Button';
import { Input } from '../../components/Input';
import { SimpleSelect } from '../../components/Select';
import { cn } from '../../util';
import { useTable } from '../core/editableTables';
import { useFeidTableView } from '../core/feid';
import { type FilterWithId, useSampleState, isFilterInvalid } from './sample';

export function FilterCard({ filter: filterOri, disabled }: { filter: FilterWithId; disabled?: boolean }) {
	const { columns } = useTable('feid');
	const { columns: shownColumns } = useFeidTableView();
	const [filter, setFilter] = useState({ ...filterOri });
	const { changeFilter, removeFilter } = useSampleState();

	const { value, operation, column: columnId } = filter;
	const column = columns.find((col) => col.sql_name === columnId);
	const columnOptions =
		!column || shownColumns.find((col) => col.sql_name === columnId) ? shownColumns : [...shownColumns, column];
	const colSelectOptions = [
		...columnOptions.map((col) => [col.sql_name, col.name]),
		...(!column ? [[columnId, columnId]] : []),
	];

	const isSelectInput = column && column.dtype === 'enum' && operation !== 'regexp';
	const isInvalid = isFilterInvalid(filter, column);

	const onChange =
		<K extends keyof Filter>(what: K) =>
		(val: Filter[K]) => {
			if (!column && what !== 'column') return;
			const fl = { ...filter, [what]: val };
			if (isSelectInput && column.type === 'static' && column.enum && !column.enum.includes(fl.value))
				fl.value = column.enum[0];

			setFilter(fl);
			if (!isFilterInvalid(fl, column)) changeFilter(fl);
		};

	return (
		<div
			className="flex shrink grow p-[1px] items-center min-w-[min(100%,26ch)] max-w-[min(100%,380px)]"
			onKeyDown={(e) => e.code === 'Escape' && (e.target as HTMLElement).blur?.()}
		>
			<SimpleSelect
				disabled={disabled}
				className={cn('grow-4 shrink min-w-0 basis-1 text-right', !column && 'ring ring-red')}
				options={colSelectOptions as [string, string][]}
				value={column?.sql_name ?? columnId}
				onChange={onChange('column')}
			/>
			<SimpleSelect
				disabled={disabled}
				className={cn(
					'grow-2 shrink min-w-0 text-center mr-1',
					operation.includes('null') ? 'max-w-max' : 'max-w-[6.5ch]',
					column?.dtype === 'enum' && isInvalid && 'ring ring-red',
				)}
				options={filterOperations.map((op) => [op, op])}
				value={operation}
				onChange={onChange('operation')}
			/>
			{!operation.includes('null') && !isSelectInput && (
				<Input
					disabled={disabled}
					className={cn('grow-4 shrink basis-2 min-w-0 max-w-[100px] h-5.5', isInvalid && 'ring ring-red')}
					value={value}
					onChange={(e) => onChange('value')(e.target.value)}
				/>
			)}
			{!operation.includes('null') && isSelectInput && column.type === 'static' && (
				<SimpleSelect
					disabled={disabled}
					className={cn('grow-2 shrink basis-2 min-w-0')}
					options={column.enum!.map((val) => [val, val])}
					value={value}
					onChange={onChange('value')}
				/>
			)}
			{!disabled && <CloseButton className="w-8" onClick={() => removeFilter(filter.id)} />}
		</div>
	);
}
