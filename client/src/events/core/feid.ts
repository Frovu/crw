import { useContext, useEffect, useState } from 'react';
import { useSampleState, sampleEditingMarkers, applySample, renderFilters, useSampleQuery } from '../sample/sample';
import { useTable } from './editableTables';
import { useEventsSettings } from './util';
import { useEventsState } from './eventsState';
import type { Sample } from '../../api';
import { AuthContext } from '../../app';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

const DEBOUNCE_COLUMN_SWITCH = 300;
let cols_last_updated_at = 0;
let cols_update_timeout: number | null = null;

export function useFeidSample() {
	const { login } = useContext(AuthContext);
	const samplesQuery = useSampleQuery();
	const { columns, data: tableData, updatedAt } = useTable('feid');
	const { filters, current: sample, isPicking } = useSampleState();

	const computeSample = () => {
		console.time('render feid sample');
		const isOwn = (s: Sample) => (s.authors.includes(login as any) ? -1 : 1);
		const sorted = samplesQuery.data
			?.sort((a, b) => -a.modified.localeCompare(b.modified))
			.sort((a, b) => isOwn(a) - isOwn(b));
		const applied = isPicking || !sorted ? tableData : applySample(tableData, sample, columns, sorted);
		const filterFn = renderFilters(filters, columns);
		const filtered = applied.filter((row) => filterFn(row));
		console.timeEnd('render feid sample');
		return { sample, data: filtered, samples: sorted, updatedAt: Date.now() };
	};

	return useQuery({
		queryKey: ['feidSample', updatedAt, isPicking, sample, columns, JSON.stringify(filters)],
		staleTime: Infinity,
		queryFn: computeSample,
		initialData: computeSample,
		placeholderData: keepPreviousData,
	}).data;
}

export function useFeidTableView() {
	const { columns } = useTable('feid');
	const [shownColumns, setShownColumns] = useState(useEventsSettings.getState().shownColumns);

	useEffect(() => {
		useEventsSettings.subscribe((st) => {
			if (Date.now() - cols_last_updated_at > DEBOUNCE_COLUMN_SWITCH) {
				cols_last_updated_at = Date.now();
				setShownColumns(st.shownColumns);
			} else {
				if (cols_update_timeout != null) clearTimeout(cols_update_timeout);
				cols_last_updated_at = Date.now();
				cols_update_timeout = setTimeout(() => {
					setShownColumns(st.shownColumns);
					cols_update_timeout = null;
				}, DEBOUNCE_COLUMN_SWITCH);
			}
		});
	}, []);

	const sort = useEventsState((state) => state.sort);
	const { current: sample, isPicking } = useSampleState();

	const { data, updatedAt } = useFeidSample();

	const renderTable = () => {
		console.time('render feid table');
		const shown = Object.keys(shownColumns).filter((col) => shownColumns[col]);
		const cols = ['id', ...shown]
			.map((name) => columns.find((col) => col.sql_name === name))
			.filter((col): col is NonNullable<typeof col> => !!col);
		const enabledIdxs = cols.map((col) => columns.findIndex((cc) => cc.sql_name === col.sql_name));
		const srtIdx = cols.findIndex((col) => col.sql_name === sort.column);
		const sortIdx = srtIdx >= 0 ? srtIdx : cols.findIndex((col) => col.name === 'time');
		const renderedData = data.map((row) => enabledIdxs.map((ci) => row[ci])) as typeof data;
		const markers = isPicking && sample ? sampleEditingMarkers(data, sample, columns) : null;
		const idxs = [...renderedData.keys()];
		const sortColumn = cols[sortIdx];
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
	};

	return useQuery({
		queryKey: ['feidView', updatedAt, isPicking, sample, columns, JSON.stringify(shownColumns), sort.column],
		staleTime: Infinity,
		queryFn: renderTable,
		initialData: renderTable,
		placeholderData: keepPreviousData,
	}).data;
}
