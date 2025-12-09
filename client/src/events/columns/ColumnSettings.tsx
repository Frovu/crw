import { useEffect, useState } from 'react';
import type { Column } from '../../api';
import { Input } from '../../components/Input';
import { Checkbox } from '../../components/Checkbox';

const defaultState = (col?: Column) => ({
	name: col?.name ?? '',
	description: col?.description ?? '',
	definition: col?.type === 'computed' ? col.definition : '',
	public: col?.type === 'computed' ? col.is_public : true,
});

export function ColumnSettings({ column }: { column?: Column }) {
	const [state, setState] = useState(defaultState(column));
	const set = <K extends keyof typeof state>(k: K, val: (typeof state)[K]) => setState((st) => ({ ...st, [k]: val }));

	useEffect(() => setState(defaultState(column)), [column]);
	console.log(column);

	const isModifiable = column?.type === 'computed' && column.is_own;

	return (
		<div>
			<div className="flex gap-1 items-center">
				<div className="text-dark">Name:</div>
				<Input
					className="h-7"
					disabled={!isModifiable}
					value={state.name}
					onChange={(e) => set('name', e.target.value)}
				/>
				<div className="text-dark pl-1">Desc:</div>

				<Input
					disabled={!isModifiable}
					className="w-120 h-7 text-left pl-2"
					value={state.description}
					onChange={(e) => set('description', e.target.value)}
				/>
			</div>
			<div className="flex gap-3 pt-2">
				<Checkbox
					className="pl-2"
					label="public column"
					checked={state.public}
					onCheckedChange={(val) => set('public', val)}
					disabled={!isModifiable}
				/>
				<div className="flex gap-1 items-center">
					<div className="text-dark">Definition:</div>

					<Input
						className="w-120 px-1 h-7"
						value={state.definition}
						onChange={(e) => set('definition', e.target.value)}
					/>
				</div>
			</div>
		</div>
	);
}
