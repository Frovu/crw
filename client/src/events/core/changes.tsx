import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { logError, logSuccess } from '../../app';
import { useEventListener, apiPost, prettyDate, dispatchCustomEvent } from '../../util';
import { Confirmation } from '../../components/Confirmation';
import {
	resetChanges,
	discardCreated,
	discardDeleted,
	discardChange,
	useTablesStore,
	editableTables,
	tableRowAsDict,
} from './editableTables';
import { valueToString } from './util';
import { Button, CloseButton } from '../../components/Button';

export function ChangesGadget() {
	const state = useTablesStore();
	const queryClient = useQueryClient();
	const [showCommit, setShowCommit] = useState(false);

	const totalChanges = editableTables
		.flatMap((tbl) => [state[tbl].created, state[tbl].deleted, state[tbl].changes])
		.reduce((a, b) => a + b.length, 0);

	const { mutate: doCommit, error } = useMutation({
		mutationFn: () =>
			apiPost('events/changes', {
				entities: Object.fromEntries(
					editableTables.map((tbl) => [
						tbl,
						{
							changes: state[tbl].changes,
							created: state[tbl].created.map((row) => tableRowAsDict(row, state[tbl].columns)),
							deleted: state[tbl].deleted,
						},
					])
				),
			}),
		onError: (e) => {
			logError('Failed submiting: ' + e?.toString());
		},
		onSuccess: () => {
			resetChanges(true);
			queryClient.invalidateQueries({ queryKey: ['tableData'] });
			logSuccess('Changes commited!');
			setShowCommit(false);
		},
	});

	useEventListener('action+commitChanges', () => setShowCommit(totalChanges > 0));
	useEventListener('action+discardChanges', () => resetChanges(false));

	return (
		<>
			{totalChanges === 0 ? null : (
				<div className="group w-42 h-full text-sm flex relative" onClick={(e) => e.stopPropagation()}>
					<div className="group-hover:invisible text-magenta">&nbsp;&nbsp;With [{totalChanges}] unsaved&nbsp;</div>
					<div className="absolute flex invisible w-full group-hover:visible">
						<Button className="grow text-right" onClick={() => dispatchCustomEvent('action+commitChanges')}>
							save
						</Button>
						<Button className="grow" onClick={() => dispatchCustomEvent('action+discardChanges')}>
							discard
						</Button>
					</div>
				</div>
			)}
			{showCommit && (
				<Confirmation callback={() => doCommit()} closeSelf={(yes) => !yes && setShowCommit(false)}>
					<h4 className="m-0 text-base text-text">
						About to commit {totalChanges} change{totalChanges > 1 ? 's' : ''}
					</h4>
					<div className="text-left text-text p-1 max-h-96 overflow-y-scroll" onClick={(e) => e.stopPropagation()}>
						{editableTables.map((tbl) => (
							<div key={tbl}>
								{state[tbl].changes.length + state[tbl].deleted.length + state[tbl].created.length > 0 && (
									<div>
										<b>{tbl.replace('feid', 'FEID')}</b>
									</div>
								)}
								{state[tbl].created.map((row) => (
									<div key={row[0]} className="text-cyan flex gap-1 items-center">
										+ {tbl === 'feid' ? prettyDate(row[1] as Date) : '#' + row[0]}
										<CloseButton onClick={() => discardCreated(tbl, row[0])} />
									</div>
								))}
								{state[tbl].deleted.map((id) => (
									<div key={id} className="text-magenta flex gap-1 items-center">
										-{' '}
										{tbl === 'feid'
											? prettyDate((state[tbl].rawData.find((r) => r[0] === id)?.[1] as Date) ?? null)
											: '#' + id}
										<CloseButton onClick={() => discardDeleted(tbl, id)} />
									</div>
								))}
								{state[tbl].changes
									.filter((ch) => !ch.silent)
									.map(({ id, column: colName, value }) => {
										const colIdx = state[tbl].columns.findIndex((c) => c.sql_name === colName);
										const column = state[tbl].columns[colIdx];
										const row = state[tbl].rawData.find((r) => r[0] === id);
										const val0 = row?.[colIdx] == null ? 'null' : valueToString(row?.[colIdx]);
										const val1 = value == null ? 'null' : valueToString(value);
										return (
											<div key={id + colName + value} className="flex items-center gap-1.5">
												<span className="text-dark">#{id}: </span>
												<i className="text-active">{column?.name}</i> {val0} -&gt; <b>{val1}</b>
												<CloseButton
													onClick={() => discardChange(tbl, { id, column: colName, value })}
												/>
											</div>
										);
									})}
							</div>
						))}
					</div>
					{(error as any) && <div className="text-red">{(error as any).toString()}</div>}
				</Confirmation>
			)}
		</>
	);
}
