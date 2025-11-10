import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { sourceLabels, type Column, type TableDataResponse, type Tables } from '../../api';
import { apiGet } from '../../util';
import { useContext, useMemo } from 'react';
import { compoundTables, useEventsState, type EditableTable, type EventsState, type TableRow } from './eventsState';
import { SampleContext, useEventsSettings } from './eventsSettings';
import { applySample, sampleEditingMarkers, useSampleState } from '../sample/sample';

const tablesColumnOrder = {
	flare: ['class', 'lat', 'lon', 'start_time', 'active_region', 'peak_time', 'end_time'],
	cme: ['time', 'speed', 'lat', 'lon', 'angular_width', 'central_angle', 'enlil_id', 'note'],
	icme: ['time'],
	sources_erupt: ['flr_start', 'cme_time', 'lat', 'lon', 'active_region', 'coords_source', 'cme_speed'],
	sources_ch: ['time', 'tag', 'lat', 'b', 'phi', 'area', 'width'],
} as const;

async function fetchTable(entity: keyof Tables, withChangelog?: boolean) {
	const { columns, data: rData, changelog } = await apiGet<TableDataResponse>('events', { entity, changelog: withChangelog });
	const data = rData as TableRow[];

	for (const [i, col] of columns.entries()) {
		if (col.dtype === 'time') {
			for (const row of data) {
				if (row[i] === null) continue;
				const date = new Date((row[i] as number) * 1e3);
				row[i] = isNaN(date.getTime()) ? null : date;
			}
		}
	}
	return { columns, data, changelog };
}

export function useCompoundTable(which: keyof typeof compoundTables) {
	return (
		useQuery({
			queryKey: ['events:' + which],
			staleTime: Infinity,
			placeholderData: keepPreviousData,
			queryFn: async () => {
				const tables = compoundTables[which];
				const results = await Promise.all(tables.map((t) => fetchTable(t)));
				const sCols = results.map((q) => q.columns);
				const sData = results.map((q) => q.data);
				const pairs = Object.values(sCols).flatMap((cols) => cols.map((col) => [col.sql_name, col]));
				const columns = [...new Map([...(tablesColumnOrder[which].map((cn) => [cn, null]) as any), ...pairs]).values()] as Column[];
				const indexes = tables.map((_, ti) => columns.map((col) => sCols[ti].findIndex((scol) => scol.sql_name === col.sql_name)));
				const data = sData.flatMap((rows, ti) =>
					rows.map((row) => [sourceLabels[tables[ti]], ...indexes[ti].map((idx) => (idx < 0 ? null : row[idx]))])
				);
				const tIdx = columns.findIndex((col) => col.sql_name === (which === 'flare' ? 'start_time' : 'time')) + 1;
				data.sort((a, b) => (a[tIdx] as Date)?.getTime() - (b[tIdx] as Date)?.getTime());

				return { data, columns: [{ sql_name: 'src', name: 'src', description: '' } as Column, ...columns] };
			},
		}).data ?? { data: [], columns: [] }
	);
}

export function useTableDataQuery(tbl: EditableTable, withChangelog?: boolean) {
	return useQuery({
		staleTime: Infinity,
		placeholderData: keepPreviousData,
		structuralSharing: false,
		queryKey: ['tableData', tbl],
		queryFn: async () => {
			const { columns, data, changelog } = await fetchTable(tbl, withChangelog);

			queueMicrotask(() =>
				useEventsState.setState((state) => {
					state.tables[tbl].changelog = changelog;
					state.tables[tbl].columns = columns;
					state.tables[tbl].index = Object.fromEntries(columns.map((col, i) => [col.sql_name, i])) as any;
					state.tables[tbl].rawData = data;
					state.tables[tbl].data = renderEditableTableData(state, tbl);
				})
			);
		},
	});
}

function renderEditableTableData(state: EventsState, tbl: EditableTable) {
	const { columns, rawData, deleted, created, changes } = state.tables[tbl];

	const data = [...rawData.map((r) => [...r]), ...created.map((r) => [...r])].filter(
		(r) => !deleted.includes(r[0] as number)
	) as typeof rawData;

	for (const { id, column, value } of changes) {
		const row = data.find((r) => r[0] === id);
		const columnIdx = columns.findIndex((col) => col.sql_name === column);
		if (row) row[columnIdx] = value;
	}

	if (tbl === 'sources_erupt') {
		const [i1, i2, i3] = ['flr_start', 'cme_time', 'rc_icme_time'].map((sname) => columns.findIndex((col) => col.sql_name === sname));
		data.sort((a: any, b: any) => (a[i1] ?? a[i2] ?? a[i3]) - (b[i1] ?? b[i2] ?? b[i3]));
	} else {
		const sortIdx = columns.findIndex((col) => col.dtype === 'time');
		if (sortIdx > 0) data.sort((a: any, b: any) => a[sortIdx] - b[sortIdx]);
	}

	return data;
}

export function useTable<T extends EditableTable>(tbl: T) {
	const query = useTableDataQuery(tbl);
	const columns = useEventsState((st) => st.tables[tbl].columns);
	const data = useEventsState((st) => st.tables[tbl].data);

	if (!data && query.isFetched) query.refetch();
	return { columns, data };
}

export function useFeidTableView() {
	const { shownColumns, showIncludeMarkers } = useEventsSettings();
	const { columns, data } = useTable('feid');
	const { current: sample, samples, data: sampleData } = useContext(SampleContext);
	const editingSample = useSampleState((state) => state.isPicking);
	const sort = useEventsState((state) => state.sort);

	const sorted = useMemo(() => {
		console.time('render feid table');
		const cols = columns.filter((col) => shownColumns?.includes(col.sql_name));
		const enabledIdxs = [0, ...cols.map((col) => columns.findIndex((cc) => cc.sql_name === col.sql_name))];
		const sortIdx = 1 + cols.findIndex((col) => col.sql_name === (sort.column === '_sample' ? 'time' : sort.column));
		const renderedData = sampleData.map((row) => enabledIdxs.map((ci) => row[ci])) as typeof sampleData;
		const markers = editingSample && sample ? sampleEditingMarkers(sampleData, sample, columns) : null;
		const idxs = [...renderedData.keys()];
		const sortColumn = cols[sortIdx - 1];
		idxs.sort(
			(a: number, b: number) =>
				sort.direction *
				(['text', 'enum'].includes(sortColumn?.type)
					? ((renderedData[a][sortIdx] as string) ?? '').localeCompare((renderedData[b][sortIdx] as string) ?? '')
					: (renderedData[a][sortIdx] ?? (0 as any)) - (renderedData[b][sortIdx] ?? (0 as any)))
		);
		if (markers && sort.column === '_sample') {
			const weights = { '  ': 0, 'f ': 1, ' +': 2, 'f+': 3, ' -': 4, 'f-': 5 } as any;
			idxs.sort((a, b) => ((weights[markers[a]] ?? 9) - (weights[markers[b]] ?? 9)) * sort.direction);
		}
		console.timeEnd('render feid table');
		return {
			data: idxs.map((i) => renderedData[i]),
			markers: markers && idxs.map((i) => markers[i]),
			columns: cols,
		};
	}, [columns, sampleData, editingSample, sample, sort, shownColumns]);

	const withIncludeMarkers = useMemo(() => {
		if (!showIncludeMarkers || !sample?.includes?.length) {
			return { ...sorted, includeMarkers: null };
		}
		const smpls = sample.includes.map((sid) => samples.find((s) => s.id === sid));
		const set = {} as any;
		for (const smpl of smpls) {
			if (!smpl) continue;
			const applied = applySample(data, smpl, columns, samples);
			for (let i = 0; i < applied.length; ++i) {
				set[applied[i][0]] = (set[applied[i][0]] ? set[applied[i][0]] + ';' : '') + smpl.name;
			}
		}
		const markers = sorted.data.map((r) => set[r[0]]);
		return { ...sorted, includeMarkers: markers };
	}, [columns, data, sorted, sample?.includes, samples, showIncludeMarkers]);

	return withIncludeMarkers;
}
