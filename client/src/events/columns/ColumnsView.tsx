import { useEffect, useState } from 'react';
import { Popup } from '../../components/Popup';
import { apiDelete, cn, useEventListener } from '../../util';
import { useEventsSettings } from '../core/util';
import { dropColumn, useTable } from '../core/editableTables';
import { Button, CloseButton } from '../../components/Button';
import { Check, Circle, Search } from 'lucide-react';
import { Input } from '../../components/Input';
import { ColumnSettings } from './ColumnSettings';
import { useColumnsState } from './columns';
import ComputeController from './ComputeController';
import { useMutation } from '@tanstack/react-query';
import { logError, logSuccess } from '../../app';
import { useFeidSample } from '../core/feid';
import { withConfirmation } from '../../components/Confirmation';

export function ColumnsView() {
	const [isOpen, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const { columns } = useTable('feid');
	const { samples } = useFeidSample();
	const { focusColumn, focusStick, set: setCol, reset: resetColumns, resetFocus, isDirty } = useColumnsState();
	const { shownColumns, enableColumn, set } = useEventsSettings();
	const [bulkAction, setBulkAction] = useState(true);
	const [drag, setDragging] = useState<null | { y: number; col: string; pos: number }>(null);

	const newOrder = Object.keys(shownColumns);
	if (drag) newOrder.splice(drag.pos, 0, newOrder.splice(newOrder.indexOf(drag.col), 1)[0]);
	const sortedColumns = columns.slice(1).sort((a, b) => newOrder.indexOf(a.sql_name) - newOrder.indexOf(b.sql_name));

	const filteredColumns = !search
		? sortedColumns
		: sortedColumns.filter((col) => col.name.toLowerCase().includes(search.toLowerCase()));

	const focusedColumn = filteredColumns.find((col) => col.sql_name === focusColumn?.sql_name);

	const { mutate: deleteColumn } = useMutation({
		mutationFn: (colId: number) => apiDelete(`events/columns/${colId}`),
		onSuccess: (_, colId) => {
			const col = columns.find((c) => c.type === 'computed' && c.id === colId);
			if (!col || col.type !== 'computed') return;
			if (focusedColumn?.sql_name === col.sql_name) resetFocus();
			dropColumn('feid', col);
			logSuccess(`Deleted column ${col.name} = ${col.definition}`);
		},
		onError: (err, colId) => {
			const col = columns.find((c) => c.type === 'computed' && c.id === colId);
			logError(`Delete #${colId} (${col?.name}): ${err}`);
		},
	});

	useEffect(() => {
		const newObj = Object.assign({}, shownColumns);
		for (const { sql_name } of columns) {
			if (newObj[sql_name] == null) newObj[sql_name] = false;
		}
		set('shownColumns', newObj);
	}, [columns]); // eslint-disable-line react-hooks/exhaustive-deps

	useEventListener('action+openColumnsSelector', () => {
		setOpen((o) => !o);
		if (!isDirty()) resetColumns();
		resetFocus();
	});

	return (
		<>
			<ComputeController />
			{isOpen && (
				<Popup
					onClose={() => setOpen(false)}
					className="h-[min(calc(100vh-34px),600px)] w-fit max-w-[calc(100vw-16px)] flex flex-col top-1 left-1 p-2"
				>
					<div className="flex gap-2">
						<div className="w-80 bg-input-bg border flex items-center" onDoubleClick={() => setSearch('')}>
							<Input
								className="grow h-8"
								value={search}
								placeholder="filter columns.."
								onChange={(e) => setSearch(e.target.value)}
							></Input>
							<Search className={cn('mx-2', !search && 'text-dark')} size={18} />
						</div>
						<Button
							variant="default"
							className="bg-input-bg"
							onClick={() => {
								resetFocus();
								resetColumns();
								useEventsSettings.setState((state) => {
									for (const col in state.shownColumns) if (col !== 'time') state.shownColumns[col] = false;
								});
							}}
						>
							Clear selection
						</Button>
					</div>
					<div
						className="p-2 grow shrink min-h-0 flex flex-col flex-wrap content-start"
						onMouseLeave={() => {
							if (!focusStick) resetFocus();
						}}
					>
						{filteredColumns.map(({ sql_name, name, description, ...column }) => (
							<div className="flex w-40 items-center gap-1" key={sql_name}>
								<Button
									title={description ?? ''}
									className={cn(
										'flex gap-2 items-center text-left',
										sql_name === focusColumn?.sql_name && 'text-active',
									)}
									onMouseEnter={(e) => {
										if ((e.shiftKey || e.ctrlKey) && e.buttons === 1)
											return enableColumn(sql_name, bulkAction);
										setDragging((dr) => dr && { ...dr, pos: newOrder.indexOf(sql_name) });

										if (!focusStick && !isDirty())
											setCol('focusColumn', { sql_name, name, description, ...column });
									}}
									onMouseDown={(e) => {
										setCol('focusColumn', { sql_name, name, description, ...column });
										setCol('focusStick', true);

										if (!e.shiftKey && !e.ctrlKey)
											return setDragging({
												y: e.clientY,
												col: sql_name,
												pos: newOrder.indexOf(sql_name),
											});
										const chk = !shownColumns[sql_name];
										setBulkAction(chk);
										enableColumn(sql_name, chk);
									}}
									onMouseUp={(e) => {
										e.stopPropagation();
										if (!drag || Math.abs(e.clientY - drag.y) < 4) {
											if (e.button === 0 && !e.shiftKey && !e.ctrlKey)
												enableColumn(sql_name, !shownColumns[sql_name]);
										} else {
											set(
												'shownColumns',
												Object.fromEntries(newOrder.map((col) => [col, shownColumns[col]])),
											);
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
								</Button>
								{column.type === 'computed' && column.is_own && (
									<CloseButton
										onClick={(e) => {
											const dependencies = samples?.filter((smpl) =>
												smpl.filters?.find(({ column: col }) => col === sql_name),
											);
											if (dependencies && dependencies.length > 0) {
												withConfirmation(
													'Delete depended column?',
													`Following samples depend on it: ${dependencies.map((s) => s.name).join(', ')}`,
													() => deleteColumn(column.id),
												);
											} else {
												deleteColumn(column.id);
											}
										}}
									/>
								)}
							</div>
						))}
					</div>
					<ColumnSettings column={focusedColumn} />
				</Popup>
			)}
		</>
	);
}
