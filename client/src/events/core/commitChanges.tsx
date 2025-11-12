import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { color, logError, logSuccess } from '../../app';
import { useEventListener, apiPost, prettyDate } from '../../util';
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

export function CommitChanges() {
	const [showCommit, setShowCommit] = useState(false);
	const state = useTablesStore.getState();
	const totalChanges = editableTables
		.flatMap((tbl) => [state[tbl].created, state[tbl].deleted, state[tbl].changes])
		.reduce((a, b) => a + b.length, 0);

	useEventListener('action+commitChanges', () => setShowCommit(totalChanges > 0));
	useEventListener('action+discardChanges', () => resetChanges(false));

	const queryClient = useQueryClient();
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

	if (!showCommit) return null;

	// TODO: redesign with tw
	return (
		<Confirmation callback={() => doCommit()} closeSelf={(yes) => !yes && setShowCommit(false)}>
			<h4 style={{ margin: '1em 0 0 0' }}>
				About to commit {totalChanges} change{totalChanges > 1 ? 's' : ''}
			</h4>
			<div style={{ textAlign: 'left', padding: '1em 2em 1em 2em' }} onClick={(e) => e.stopPropagation()}>
				{Object.entries(changes).map(([tbl, chgs]) => (
					<div key={tbl}>
						{chgs.length + created[tbl as TableName].length + deleted[tbl as TableName].length > 0 && (
							<div>
								<b>{tbl.replace('feid', 'FEID')}</b>
							</div>
						)}
						{created[tbl as TableName].map((row) => (
							<div key={row[0]} style={{ color: color('cyan') }}>
								+ {tbl === 'feid' ? prettyDate(row[1] as Date) : '#' + row[0]}
								<div
									className="CloseButton"
									style={{ transform: 'translate(4px, 2px)' }}
									onClick={() => discardCreated(tbl as any, row[0])}
								/>
							</div>
						))}
						{deleted[tbl as TableName].map((id) => (
							<div key={id} style={{ color: color('magenta') }}>
								-{' '}
								{tbl === 'feid'
									? prettyDate((rawData[tbl as TableName]?.find((r) => r[0] === id)?.[1] as Date) ?? null)
									: '#' + id}
								<div
									className="CloseButton"
									style={{ transform: 'translate(4px, 2px)' }}
									onClick={() => discardDeleted(tbl as any, id)}
								/>
							</div>
						))}
						{chgs
							.filter((ch) => !ch.silent)
							.map(({ id, column: cId, value }) => {
								const column = columns[tbl as keyof typeof columns]?.find((c) => c.sql_name === cId);
								const row = rawData[tbl as keyof typeof changes]!.find((r) => r[0] === id);
								const colIdx = columns[tbl as keyof typeof changes]!.findIndex((c) => c.sql_name === cId);
								const val0 = row?.[colIdx] == null ? 'null' : valueToString(row?.[colIdx]);
								const val1 = value == null ? 'null' : valueToString(value);
								return (
									<div key={id + cId + value}>
										<span style={{ color: color('text-dark') }}>#{id}: </span>
										<i style={{ color: color('active') }}>{column?.name}</i> {val0} -&gt; <b>{val1}</b>
										<div
											className="CloseButton"
											style={{ transform: 'translate(4px, 2px)' }}
											onClick={() => discardChange(tbl as any, { id, column: cId, value })}
										/>
									</div>
								);
							})}
					</div>
				))}
			</div>
			{(error as any) && <div style={{ color: color('red') }}>{(error as any).toString()}</div>}
		</Confirmation>
	);
}
