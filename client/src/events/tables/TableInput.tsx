import { useState, useMemo, type ChangeEvent } from 'react';
import type { Column } from '../../api';
import { type EditableTable, makeChange } from '../core/editableTables';
import { useEventsState } from '../core/eventsState';
import { parseColumnValue, isValidColumnValue } from '../core/util';
import { color } from '../../app';

export function CellInput({
	id,
	column,
	value,
	table,
	options,
	change,
}: {
	id: number;
	column: Column;
	value: string;
	table: EditableTable;
	options?: string[];
	change?: (val: any) => boolean;
}) {
	const [invalid, setInvalid] = useState(false);
	const escapeCursor = useEventsState((state) => state.escapeCursor);

	return useMemo(() => {
		const doChange = (v: any) => (change ? change(v) : makeChange(table, { id, column: column.sql_name, value: v }));

		const onChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>, save: boolean = false) => {
			const str = e.target.value.trim();
			const val = str === '' ? null : str === 'auto' ? str : parseColumnValue(str, column);
			const isValid = ['auto', null].includes(val as any) || isValidColumnValue(val, column);
			const isOk = isValid && (!save || doChange(val));
			setInvalid(!isOk);
		};

		const inpStype = {
			width: '100%',
			borderWidth: 0,
			padding: 0,
			backgroundColor: color('bg'),
			boxShadow: column.dtype !== 'enum' ? ' 0 0 16px 4px ' + (invalid ? color('red') : color('active')) : 'unest',
		};

		return (
			<>
				{column.dtype === 'enum' && (
					<select
						autoFocus
						style={inpStype!}
						value={value}
						onChange={(e) => {
							onChange(e, true);
							escapeCursor();
						}}
					>
						{column.type === 'static' && !column.not_null && <option value="">&lt;null&gt;</option>}
						{column.type === 'static' &&
							(options ?? column.enum)?.map((val) => (
								<option key={val} value={val}>
									{val}
								</option>
							))}
					</select>
				)}
				{column.dtype !== 'enum' && (
					<input
						type="text"
						autoFocus
						style={inpStype!}
						defaultValue={value}
						onChange={onChange}
						onBlur={(e) => {
							e.target.value !== value && onChange(e, true);
							escapeCursor();
						}}
					/>
				)}
			</>
		);
	}, [column.type, id, JSON.stringify(options), invalid, table, value]); // eslint-disable-line
}
