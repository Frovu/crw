import { useQuery } from 'react-query';
import { fetchTable, type ColumnDef } from './columns';
import { flaresLinkId, setRawData, useEventsState, type TableName } from './eventsState';

export const flrColumnOrder = ['class', 'lat', 'lon', 'start', 'AR', 'peak', 'end'];
export const flrSources = ['SFT', 'DKI', 'dMN'] as const;

export function getFlareLink(src: any) {
	const lnk = flaresLinkId[src as keyof typeof flaresLinkId];
	return {
		linkColId: lnk,
		idColId: lnk?.endsWith('id') ? 'id' : 'start_time'
	};
}

export function parseFlareFlux(cls: string | null) {
	if (!cls) return null;
	const multi = (() => {
		switch (cls.at(0)) {
			case 'A': return .1;
			case 'B': return 1;
			case 'C': return 10;
			case 'M': return 100;
			case 'X': return 1000; }
	})();
	if (!multi) return null;
	const val = multi * parseFloat(cls.slice(1));
	return isNaN(val) ? null : Math.round(val * 10) / 10;
}

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
					col.width = 4.5;
				if (['end', 'peak'].includes(col.name))
					col.width = 6;
			}
	
			return { data, columns: [
				{ id: 'src', name: 'src', description: '', fullName: 'src', width: 4 } as ColumnDef,
				...columns
			] };

		}
	}).data ?? { data: [], columns: [] };
}

export function useTableQuery(tbl: TableName) {
	const data = useEventsState(st => st.data[tbl]);

	const query = useQuery({
		queryKey: [tbl],
		staleTime: Infinity,
		queryFn: async () => {
			const { columns, data: dt } = await fetchTable(tbl);
			setRawData(tbl, dt as any, columns);
			return data;
		}
	});

	if (!data && query.isFetched)
		query.refetch();

	return query;
}