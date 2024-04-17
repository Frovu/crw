import { useQuery } from 'react-query';
import { fetchTable, type ColumnDef } from './columns';
import { setRawData, useEventsState, type TableName } from './eventsState';
import { useEffect } from 'react';

export const flrColumnOrder = ['class', 'lat', 'lon', 'AR', 'start', 'peak', 'end'];
export const flrSources = ['SFT', 'DKI', 'dMN'] as const;

export const flaresLinkId = {
	SFT: 'solarsoft_flr_start',
	NOA: 'noaa_flare_start',
	DKI: 'donki_flr_id',
	dMN: 'solardemon_flr_id'
} as const;

export const otherLinkId = {
	'R&C': 'rc_icme_time',
	LASCO: 'lasco_cme_time',
	DKI: 'donki_cme_id',
	dMN: 'solardemon_dim_id'
} as const;

export function useFlaresTable() {
	return useQuery({
		queryKey: ['flares'],
		staleTime: Infinity,
		keepPreviousData: true,
		queryFn: async () => {
			const results = await Promise.all([
				fetchTable('solarsoft_flares'),
				fetchTable('donki_flares'),
				fetchTable('solardemon_flares')
			]);
			const sCols = results.map(q => q.columns);
			const sData = results.map(q => q.data);
			const pairs = Object.values(sCols).flatMap(cols => cols.map(c => [c.name, c]));
			const columns = [...new Map([...flrColumnOrder.map(cn => [cn, null]) as any, ...pairs]).values()] as ColumnDef[];
			const indexes = flrSources.map((src, srci) =>
				columns.map(c => sCols[srci].findIndex(sc => sc.name === c.name)));
			const data = sData.flatMap((rows, srci) => rows.map(row =>
				[flrSources[srci], ...indexes[srci].map(idx => idx < 0 ? null : row[idx])]));
			const tIdx = columns.findIndex(c => c.id === 'start_time') + 1;
			data.sort((a, b) => (a[tIdx] as Date)?.getTime() - (b[tIdx] as Date)?.getTime());
	
			for (const col of columns) {
				if (col.name.includes('class'))
					col.width = 5.5;
				if (['lat', 'lon'].includes(col.name))
					col.width = 6;
				if (['end', 'peak'].includes(col.name))
					col.width = 6;
			}
	
			return { data, columns: [
				{ id: 'src', name: 'src', description: '', fullName: 'src', width: 4.5 } as ColumnDef,
				...columns
			] };

		}
	}).data ?? null;
}

export function useTableQuery(tbl: TableName) {
	const data = useEventsState(st => st.data[tbl]);

	const query = useQuery({
		queryKey: [tbl],
		staleTime: Infinity,
		queryFn: async () => {
			const { columns, data } = await fetchTable(tbl);
			setRawData(tbl, data as any, columns);
			return data;
		}
	});

	useEffect(() => {
		if (!data && query.data)
			query.refetch();
	}, [data, query]);

	return query;
}