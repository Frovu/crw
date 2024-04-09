import { useQuery } from 'react-query';
import { fetchTable, type ColumnDef } from './columns';

export const flrColumnOrder = ['class', 'lat', 'lon', 'AR', 'start', 'peak', 'end'];
export const flrSources = ['SFT', 'DKI', 'dMN'] as const;

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
			}
	
			return { data, columns: [
				{ id: 'src', name: 'src', description: '', fullName: 'src', width: 4.5 } as ColumnDef,
				...columns
			] };

		}
	}).data ?? null;
}

export function useEruptTable() {
	const srcQuery = useQuery({
		queryKey: ['sources_erupt'],
		staleTime: Infinity,
		queryFn: () => fetchTable('sources_erupt')
	});

	return useQuery({
		queryKey: ['sources_erupt', srcQuery?.data],
		staleTime: Infinity,
		queryFn: () => {
			if (!srcQuery?.data)
				return null;
			const { columns, data } = srcQuery.data;

			return { columns, data };
		}
	}).data ?? null;
}