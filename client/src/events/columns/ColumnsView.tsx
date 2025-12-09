import { useEffect, useState } from 'react';
import { Popup } from '../../components/Popup';
import { cn, useEventListener } from '../../util';
import { useEventsSettings } from '../core/util';
import { useTable } from '../core/editableTables';
import { Button } from '../../components/Button';
import { Check, Circle, Search } from 'lucide-react';
import { Input } from '../../components/Input';
import { ColumnSettings } from './ColumnSettings';

export function ColumnsView() {
	const [isOpen, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const [focus, setFocus] = useState('');
	const { columns } = useTable('feid');
	const { shownColumns, enableColumn, set } = useEventsSettings();
	const [bulkAction, setBulkAction] = useState(true);
	const [drag, setDragging] = useState<null | { y: number; col: string; pos: number }>(null);

	const newOrder = Object.keys(shownColumns);
	if (drag) newOrder.splice(drag.pos, 0, newOrder.splice(newOrder.indexOf(drag.col), 1)[0]);
	const sortedColumns = columns.slice(1).sort((a, b) => newOrder.indexOf(a.sql_name) - newOrder.indexOf(b.sql_name));

	const filteredColumns = !search
		? sortedColumns
		: sortedColumns.filter((col) => col.name.toLowerCase().includes(search.toLowerCase()));

	const focusedColumn = filteredColumns.find((col) => col.sql_name === focus);

	useEffect(() => {
		const newObj = Object.assign({}, shownColumns);
		for (const { sql_name } of columns) {
			if (newObj[sql_name] == null) newObj[sql_name] = false;
		}
		set('shownColumns', newObj);
	}, [columns]); // eslint-disable-line react-hooks/exhaustive-deps

	useEventListener('action+openColumnsSelector', () => setOpen((o) => !o));

	return !isOpen ? null : (
		<Popup
			onClose={() => setOpen(false)}
			className="h-[min(calc(100vh-16px),600px)] max-w-[calc(100vw-16px)] flex flex-col top-1 left-1 p-2"
		>
			<div className="w-64 bg-input-bg border flex items-center">
				<Input
					className="grow h-8"
					value={search}
					placeholder="filter columns.."
					onChange={(e) => setSearch(e.target.value)}
				></Input>
				<Search className={cn('mx-2', !search && 'text-dark')} size={18} />
			</div>
			<div className="p-2 shrink min-h-0 flex flex-col flex-wrap content-start">
				{filteredColumns.map(({ sql_name, name, description }) => (
					<Button
						key={sql_name}
						title={description ?? ''}
						className={cn('flex gap-2 items-center w-40 text-left', sql_name === focus && 'text-active')}
						onMouseEnter={(e) => {
							if ((e.shiftKey || e.ctrlKey) && e.buttons === 1) return enableColumn(sql_name, bulkAction);
							setDragging((dr) => dr && { ...dr, pos: newOrder.indexOf(sql_name) });
						}}
						onMouseDown={(e) => {
							// if (e.button !== 0) return role && generic && setGeneric(generic);
							if (!e.shiftKey && !e.ctrlKey)
								return setDragging({ y: e.clientY, col: sql_name, pos: newOrder.indexOf(sql_name) });
							const chk = !shownColumns[sql_name];
							setBulkAction(chk);
							enableColumn(sql_name, chk);
							setFocus(sql_name);
						}}
						onMouseUp={(e) => {
							e.stopPropagation();
							if (!drag || Math.abs(e.clientY - drag.y) < 4) {
								if (e.button === 0 && !e.shiftKey && !e.ctrlKey)
									enableColumn(sql_name, !shownColumns[sql_name]);
							} else {
								set('shownColumns', Object.fromEntries(newOrder.map((col) => [col, shownColumns[col]])));
							}
							setDragging(null);
						}}
					>
						{shownColumns[sql_name] ? (
							<Check strokeWidth={4} size={16} />
						) : (
							<Circle className="text-dark/50" size={16} />
						)}
						{name}
						{/* {generic?.is_own && (
							<div
								className="CloseButton"
								onClick={(e) => {
									const dep = samples.filter((smpl) => smpl.filters?.find(({ column }) => column === sql_name));
									console.log('dependent samples', dep);
									e.stopPropagation();
									if (dep.length > 0) setSamplesDepend(dep.map((s) => s.name));
									else deleteGeneric(generic.sql_name);
								}}
							/>
						)} */}
					</Button>
				))}
			</div>
			<ColumnSettings column={focusedColumn} />
		</Popup>
	);
}
