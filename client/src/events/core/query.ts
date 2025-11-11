import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { sourceLabels, type Column, type TableDataResponse, type Tables } from '../../api';
import { apiGet } from '../../util';
import { setRawData, type EditableTable, type TableRow } from './editableTables';

export const compoundTables = {
	cme: ['lasco_cmes', 'donki_cmes', 'cactus_cmes'],
	icme: ['r_c_icmes'],
	flare: ['solarsoft_flares', 'donki_flares'],
} as const;

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
			queryKey: ['compoundTable', which],
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
			setRawData(tbl, data, columns, changelog);
		},
	});
}
