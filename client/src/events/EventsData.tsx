import { type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { MainTableContext, SampleContext, useEventsSettings, valueToString } from './events';
import { apiGet, apiPost, prettyDate, useEventListener } from '../util';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Sample, applySample, renderFilters, useSampleState } from './sample';
import { AuthContext, color, logError, logMessage, logSuccess } from '../app';
import { type DataRow, type Value } from './columns';
import { Confirmation } from '../Utility';
import {
	discardChange,
	discardCreated,
	discardDeleted,
	resetChanges,
	rowAsDict,
	setRawData,
	useEventsState,
	type TableName,
} from './eventsState';
import type { ChangelogResponse, Column, ComputedColumn, Series } from '../api';

export default function EventsDataProvider({ children }: { children: ReactNode }) {
	const { login } = useContext(AuthContext);
	// ************************************************************************************
	// 								  MAIN TABLE STRUCTURE
	// ************************************************************************************

	const structureQuery = useQuery({
		staleTime: Infinity,
		queryKey: ['tableStructure'],
		queryFn: async () => {
			const res = await apiGet<{
				tables: { [table: string]: Column[] };
				computed_columns: ComputedColumn[];
				series: Series[];
			}>('events/table_structure');

			console.log('%ctable structure:', 'color: #0f0', res);
			return res;
		},
	});

	// ************************************************************************************
	// 								  MAIN TABLE DATA
	// ************************************************************************************

	const columnOrder = useEventsSettings((st) => st.columnOrder);
	const dataQuery = useQuery({
		staleTime: Infinity,
		placeholderData: keepPreviousData,
		structuralSharing: false,
		queryKey: ['tableData', 'feid'],
		queryFn: () => apiGet<{ data: Value[][]; fields: string[]; changelog?: ChangelogResponse }>('events', { changelog: true }),
	});

	useEffect(() => {
		logMessage('Events table loaded', 'debug');
	}, [dataQuery.data]);

	const mainContext = useMemo(() => {
		if (!dataQuery.data || !structureQuery.data) return null;
		const { series, tables, computed_columns } = structureQuery.data;
		const { data: rawData, fields, changelog } = dataQuery.data;

		const cols = [...tables.feid.slice(1), ...computed_columns];
		const filtered = [
			tables.feid[0],
			...(() => {
				if (columnOrder == null) {
					return cols.sort((a, b) => a.name?.localeCompare(b.name));
				} else {
					// place new columns at the end
					const index = (id: string) => {
						const idx = columnOrder.indexOf(id);
						return idx < 0 ? 9999 : idx;
					};
					return cols.sort((a, b) => index(a.name) - index(b.name));
				}
			})(),
		].filter((c) => fields.includes(c.sql_name));

		const indexes = filtered.map((c) => fields.indexOf(c.sql_name));
		const data = rawData.map((row: Value[]) => indexes.map((i) => row[i])) as DataRow[];
		for (const [i, col] of Object.values(filtered).entries()) {
			if (col.dtype === 'time') {
				for (const row of data) {
					if (row[i] === null) continue;
					if (col.name.startsWith('flr')) console.log(row[i]);
					const date = new Date((row[i] as number) * 1e3);
					row[i] = isNaN(date.getTime()) ? null : date;
				}
			}
		}

		setRawData('feid', data, filtered);

		console.log('%crendered table:', 'color: #0f0', filtered, fields, data, changelog);
		return {
			columns: filtered,
			tables: { ...tables, feid: filtered },
			changelog,
			series,
		} as const;
	}, [columnOrder, dataQuery.data, structureQuery.data]);

	// ************************************************************************************
	// 										CHANGES
	// ************************************************************************************

	const [showCommit, setShowCommit] = useState(false);
	const created = useEventsState((state) => state.created);
	const deleted = useEventsState((state) => state.deleted);
	const changes = useEventsState((state) => state.changes);
	const data = useEventsState((state) => state.data);
	const rawData = useEventsState((state) => state.rawData);
	const columns = useEventsState((state) => state.columns);
	const totalChanges = [changes, created, deleted].flatMap(Object.values).reduce((a, b) => a + b.length, 0);

	useEventListener('action+commitChanges', () => setShowCommit(totalChanges > 0));
	useEventListener('action+discardChanges', () => resetChanges(false));

	const queryClient = useQueryClient();
	const { mutate: doCommit, error } = useMutation({
		mutationFn: () =>
			apiPost('events/changes', {
				entities: Object.fromEntries(
					(Object.keys(changes) as TableName[]).map((tbl) => [
						tbl,
						{ changes: changes[tbl], created: created[tbl].map((r) => rowAsDict(r, columns[tbl]!)), deleted: deleted[tbl] },
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

	// ************************************************************************************
	// 										SAMPLE
	// ************************************************************************************

	const filters = useSampleState((state) => state.filters);
	const sample = useSampleState((state) => state.current);
	const isPicking = useSampleState((state) => state.isPicking);

	const samplesQuery = useQuery({
		queryKey: ['samples'],
		queryFn: async () => {
			const { samples } = await apiGet<{ samples: Sample[] }>('events/samples');
			for (const smpl of samples) for (const k of ['created', 'modified'] as const) smpl[k] = smpl[k] && new Date(smpl[k]);
			console.log('%cavailable samples:', 'color: #0f0', samples);
			return samples;
		},
	});

	const sampleContext = useMemo(() => {
		const samples = samplesQuery.data;
		if (!data.feid || !columns.feid || !samples) return null;
		const isOwn = (s: Sample) => (s.authors.includes(login as any) ? -1 : 1);
		const sorted = samples.sort((a, b) => b.modified.getTime() - a.modified.getTime()).sort((a, b) => isOwn(a) - isOwn(b));
		const dt = data.feid;
		const applied = isPicking ? (dt.map((row) => [...row]) as typeof dt) : applySample(dt, sample, columns.feid, sorted);
		const filterFn = renderFilters(filters, columns.feid);
		const filtered = applied.filter((row) => filterFn(row));
		return {
			data: filtered,
			current: sample,
			samples: sorted,
		};
	}, [samplesQuery.data, data.feid, columns.feid, isPicking, sample, filters, login]);

	if (!mainContext || !data || !sampleContext || !structureQuery.data || !samplesQuery.data) {
		return (
			<div style={{ padding: 8 }}>
				<div>{structureQuery.isLoading && 'Loading tables..'}</div>
				<div>{dataQuery.isLoading && 'Loading data...'}</div>
				<div>{samplesQuery.isLoading && 'Loading samples...'}</div>
				<div style={{ color: 'var(--color-red)' }}>
					<div>{structureQuery.error?.toString() ?? dataQuery.error?.toString() ?? samplesQuery.error?.toString()}</div>
				</div>
			</div>
		);
	}
	return (
		<MainTableContext.Provider value={mainContext}>
			<SampleContext.Provider value={sampleContext}>
				{mainContext && showCommit && (
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
				)}
				{children}
			</SampleContext.Provider>
		</MainTableContext.Provider>
	);
}
