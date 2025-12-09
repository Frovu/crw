import { useEffect, useState } from 'react';
import type { Column } from '../../api';
import { Input } from '../../components/Input';

const state = (col?: Column) => ({ name: col?.name ?? '', description: col?.description ?? '' });

export function ColumnSettings({ column }: { column?: Column }) {
	const [{ name, description }, setState] = useState(state(column));

	useEffect(() => setState(state(column)), [column]);

	return (
		<div>
			<div className="text-dark flex gap-1">
				Name:
				<Input value={name} onChange={(e) => setState((st) => ({ ...st, name: e.target.value }))} />
			</div>
			<div className="text-dark flex gap-1">
				Desc:
				<Input value={name} onChange={(e) => setState((st) => ({ ...st, name: e.target.value }))} />
			</div>
		</div>
	);
}
