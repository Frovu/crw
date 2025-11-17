import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { logError, logSuccess } from '../../app';
import { useEventListener, apiPost, prettyDate, dispatchCustomEvent } from '../../util';
import { Confirmation } from '../../Utility';
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

export function ChangesGadget() {
	const state = useTablesStore();
	const queryClient = useQueryClient();
	const [showCommit, setShowCommit] = useState(false);
	const [hovered, setHovered] = useState(false);

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
				<div
					className="w-42 h-full text-sm flex"
					onClick={(e) => e.stopPropagation()}
					onMouseEnter={() => setHovered(true)}
					onMouseLeave={() => setHovered(false)}
				>
					{!hovered && <div className="text-magenta">&nbsp;&nbsp;With [{totalChanges}] unsaved&nbsp;</div>}
					{hovered && (
						<>
							<button
								className="btn-text grow text-right"
								onClick={() => dispatchCustomEvent('action+commitChanges')}
							>
								save
							</button>
							<button className="btn-text grow" onClick={() => dispatchCustomEvent('action+discardChanges')}>
								discard
							</button>
						</>
					)}
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
									<div key={row[0]} className="text-cyan">
										+ {tbl === 'feid' ? prettyDate(row[1] as Date) : '#' + row[0]}
										<div
											className="btn-close"
											style={{ transform: 'translate(4px, 2px)' }}
											onClick={() => discardCreated(tbl, row[0])}
										/>
									</div>
								))}
								{state[tbl].deleted.map((id) => (
									<div key={id} className="text-magenta">
										-{' '}
										{tbl === 'feid'
											? prettyDate((state[tbl].rawData.find((r) => r[0] === id)?.[1] as Date) ?? null)
											: '#' + id}
										<div
											className="btn-close"
											style={{ transform: 'translate(4px, 2px)' }}
											onClick={() => discardDeleted(tbl, id)}
										/>
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
											<div key={id + colName + value}>
												<span className="text-text-dark">#{id}: </span>
												<i className="text-active">{column?.name}</i> {val0} -&gt; <b>{val1}</b>
												<div
													className="btn-close pl-1"
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
