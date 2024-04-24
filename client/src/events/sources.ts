import { useQuery } from 'react-query';
import { fetchTable, type ColumnDef } from './columns';
import { flaresLinkId, setRawData, useEventsState, type RowDict, type TableName } from './eventsState';

export const flrColumnOrder = ['class', 'lat', 'lon', 'start', 'AR', 'peak', 'end'];
export const flrSources = ['SFT', 'DKI', 'dMN'] as const;
export const cmeColumnOrder = ['time', 'speed', 'lat', 'lon', 'central_angle', 'angular_width', 'note'];
export const cmeSources = ['LSC', 'DKI'] as const;

export const cmeLinks = {
	LSC: ['lasco_cme_time', 'time'],
	DKI: ['donki_cme_id', 'id']
};

export function getFlareLink(src: any) {
	const lnk = flaresLinkId[src as keyof typeof flaresLinkId];
	return {
		linkColId: lnk,
		idColId: lnk?.endsWith('id') ? 'id' : 'start_time'
	};
}

export function assignFlareToErupt(erupt: RowDict, flare: RowDict) {
	erupt.flr_source = flare.src;

	erupt.lat = flare.lat;
	erupt.lon = flare.lon;
	erupt.coords_source = 'FLR';

	erupt.flr_start = flare.start_time;
	erupt.flr_peak = flare.peak_time;
	erupt.flr_end = flare.end_time;
	erupt.active_region = flare.active_region;
	erupt.flr_flux = flare.flux ?? parseFlareFlux(flare.class as string);
}

export function serializeCoords({ lat, lon }: { lat: number | null, lon: number | null }) {
	return (lat != null ? (lat > 0 ? 'N' : 'S') + Math.abs(lat) : '')
		 + (lon != null ? (lon > 0 ? 'W' : 'E') + Math.abs(lon) : '');
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

export function useCMETable() {
	return useQuery({
		queryKey: ['CMEs'],
		staleTime: Infinity,
		keepPreviousData: true,
		queryFn: async () => {
			const results = await Promise.all([
				fetchTable('lasco_cmes'),
				fetchTable('donki_cmes')
			]);
			const sCols = results.map(q => q.columns);
			const sData = results.map(q => q.data);
			const pairs = Object.values(sCols).flatMap(cols => cols.map(c => [c.id, c]));
			const columns = [...new Map([...cmeColumnOrder.map(cn => [cn, null]) as any, ...pairs]).values()] as ColumnDef[];
			const indexes = cmeSources.map((src, srci) =>
				columns.map(c => sCols[srci].findIndex(sc => sc.id === c.id)));
			const data = sData.flatMap((rows, srci) => rows.map(row =>
				[cmeSources[srci], ...indexes[srci].map(idx => idx < 0 ? null : row[idx])]));
			const tIdx = columns.findIndex(c => c.id === 'time') + 1;
			data.sort((a, b) => (a[tIdx] as Date)?.getTime() - (b[tIdx] as Date)?.getTime());
	
			for (const col of columns) {
				if (['lat', 'lon'].includes(col.name))
					col.width = 4.5;
				if (['type', 'level'].includes(col.name))
					col.width = 3;
			}
	
			return { data, columns: [
				{ id: 'src', name: 'src', description: '', fullName: 'src', width: 4 } as ColumnDef,
				...columns
			] };

		}
	}).data ?? { data: [], columns: [] };
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