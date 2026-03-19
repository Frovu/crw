import { useState, type ChangeEvent } from 'react';
import type { Column } from '../../api';
import { type TableValue } from '../core/editableTables';
import { useEventsState } from '../core/eventsState';
import { parseColumnValue, isValidColumnValue, valueToString } from '../core/util';
import { cn } from '../../util';
import { SimpleSelect } from '../../components/Select';

export function TableInput({
	column,
	value,
	options,
	onChange,
}: {
	column: Column;
	value: TableValue;
	options?: string[];
	onChange: (val: TableValue) => void;
}) {
	const [invalid, setInvalid] = useState(false);
	const escapeCursor = useEventsState((state) => state.escapeCursor);

	const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>, save: boolean = false) => {
		const str = e.target.value.trim();
		const val = str === '' ? null : str === 'auto' ? str : parseColumnValue(str, column);
		const isValid = ['auto', null].includes(val as any) || isValidColumnValue(val, column);
		const isOk = isValid && (!save || onChange(val));
		setInvalid(!isOk);
	};

	const className = cn('w-full h-full border-0 bg-active/15 text-center', invalid && 'text-red bg-red/15');

	return (
		<>
			{column.dtype === 'enum' && column.type === 'static' && (
				<SimpleSelect
					autoFocus
					className={className}
					options={[
						...(!column.not_null ? [[null, '<null>'] as [null, string]] : []),
						...((options ?? column.enum)?.map((val) => [val, val] as [string, string]) ?? []),
					]}
					value={valueToString(value)}
					onChange={(val) => {
						onChange(val);
						escapeCursor();
					}}
				/>
			)}
			{column.dtype !== 'enum' && (
				<input
					type="text"
					autoFocus
					className={className}
					defaultValue={valueToString(value)}
					onChange={handleChange}
					onBlur={(e) => {
						if (e.target.value !== valueToString(value)) handleChange(e, true);
						escapeCursor();
					}}
				/>
			)}
		</>
	);
}
