import { useContext, useMemo } from 'react';
import { useSampleState, sampleEditingMarkers, applySample, renderFilters, useSampleQuery } from '../sample/sample';
import { useTable } from './editableTables';
import { useEventsSettings } from './util';
import { useEventsState } from './eventsState';
import type { Sample } from '../../api';
import { AuthContext } from '../../app';

export function useFeidSample() {
	const { login } = useContext(AuthContext);
	const samplesQuery = useSampleQuery();
	const { columns, data: tableData } = useTable('feid');
	const { filters, current: sample, isPicking } = useSampleState();

	return useMemo(() => {
		console.time('render feid sample');
		const isOwn = (s: Sample) => (s.authors.includes(login as any) ? -1 : 1);
		const sorted = samplesQuery.data
			?.sort((a, b) => -a.modified.localeCompare(b.modified))
			.sort((a, b) => isOwn(a) - isOwn(b));
		const applied = isPicking || !sorted ? tableData : applySample(tableData, sample, columns, sorted);
		const filterFn = renderFilters(filters, columns);
		const filtered = applied.filter((row) => filterFn(row));
		console.time('render feid sample');
		return {
			data: filtered,
			samples: sorted,
		};
	}, [samplesQuery.data, isPicking, tableData, sample, columns, filters, login]);
}

export function useFeidTableView() {
	const { shownColumns, showIncludeMarkers } = useEventsSettings();
	const { columns } = useTable('feid');

	const sort = useEventsState((state) => state.sort);
	const { current: sample, isPicking } = useSampleState();

	const { data, samples } = useFeidSample();

	const sorted = useMemo(() => {
		console.time('render feid table');
		const cols = columns.filter((col) => shownColumns?.includes(col.sql_name));
		const enabledIdxs = [0, ...cols.map((col) => columns.findIndex((cc) => cc.sql_name === col.sql_name))];
		const sortIdx = 1 + cols.findIndex((col) => col.sql_name === (sort.column === '_sample' ? 'time' : sort.column));
		const renderedData = data.map((row) => enabledIdxs.map((ci) => row[ci])) as typeof data;
		const markers = isPicking && sample ? sampleEditingMarkers(data, sample, columns) : null;
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
	}, [columns, data, isPicking, sample, sort, shownColumns]);

	const withIncludeMarkers = useMemo(() => {
		if (!showIncludeMarkers || !sample?.includes?.length || !samples) {
			return { ...sorted, includeMarkers: null };
		}
		const smpls = sample.includes.map((sid) => samples.find((s) => s.id === sid));
		const set = {} as { [k: string]: string };
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
