import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { sourceLabels, type Column, type TableDataResponse, type Tables } from '../../api';
import { apiGet } from '../../util';
import { setRawData, tableRowAsDict, type EditableTable, type TableRow } from './editableTables';
import { compoundTables, type EruptiveEvent } from './sourceActions';
import { logError } from '../../app';

const tablesColumnOrder = {
	flare: ['class', 'lat', 'lon', 'start_time', 'active_region', 'peak_time', 'end_time'],
	cme: ['time', 'speed', 'lat', 'lon', 'angular_width', 'central_angle', 'enlil_id', 'note'],
	icme: ['time'],
	sources_erupt: ['flr_start', 'cme_time', 'lat', 'lon', 'active_region', 'coords_source', 'cme_speed'],
	sources_ch: ['time', 'tag', 'lat', 'b', 'phi', 'area', 'width'],
} as const;

async function fetchTable(entity: keyof Tables, chlog?: boolean) {
	try {
		const { columns, data: rData, changelog } = await apiGet<TableDataResponse>('events', { entity, changelog: !!chlog });
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
	} catch (e) {
		logError(`Fetching ${entity}: ${e}`);
		throw e;
	}
}

export function useCompoundTable<T extends keyof typeof compoundTables>(which: T) {
	return useQuery({
		queryKey: ['compoundTable', which],
		staleTime: Infinity,
		placeholderData: keepPreviousData,
		queryFn: async () => {
			const tables = compoundTables[which];
			const results = await Promise.all(tables.map((t) => fetchTable(t)));
			const sCols = results.map((q) => q.columns);
			const sData = results.map((q) => q.data);
			const pairs = Object.values(sCols).flatMap((cols) => cols.map((col) => [col.sql_name, col]));
			const cols = [
				...new Map([...(tablesColumnOrder[which].map((cn) => [cn, null]) as any), ...pairs]).values(),
			] as Column[];
			const indexes = tables.map((_, ti) =>
				cols.map((col) => sCols[ti].findIndex((scol) => scol.sql_name === col.sql_name))
			);
			const data = sData.flatMap((rows, ti) =>
				rows.map((row) => [sourceLabels[tables[ti]], ...indexes[ti].map((idx) => (idx < 0 ? null : row[idx]))])
			);
			const tIdx = cols.findIndex((col) => col.sql_name === (which === 'flare' ? 'start_time' : 'time')) + 1;
			data.sort((a, b) => (a[tIdx] as Date)?.getTime() - (b[tIdx] as Date)?.getTime());

			const columns = [{ sql_name: 'src', name: 'src', description: '' } as Column, ...cols];
			const index = Object.fromEntries(columns.map((col, i) => [col.sql_name, i])) as {
				[c in keyof EruptiveEvent<T>]: number;
			};

			return {
				data,
				columns,
				index,
				entry: (row: (typeof data)[number]) => tableRowAsDict(row, columns) as EruptiveEvent<T>,
			};
		},
		throwOnError: true,
	}).data;
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
			return { columns, data, changelog };
		},
	});
}
