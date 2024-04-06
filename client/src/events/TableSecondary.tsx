import { useContext, useMemo } from 'react';
import { LayoutContext } from '../layout';
import { TableViewContext, type ColumnDef, type Value } from './events';
import { useQuery } from 'react-query';
import { apiGet } from '../util';
import { fromDesc } from './columns';

export default function SecondaryTable() {
	const { id: nodeId, params } = useContext(LayoutContext)!;

	const entity = 'r_c_icmes';

	// TODO: limit time
	const query = useQuery(['eventsCatalogue', entity], async () => {
		const res = await apiGet<{ columns: ColumnDef[], data: (Value | string[])[][] }>('events/catalogue', { entity });
		const columns = res.columns.map(desc => fromDesc(entity, desc.name, desc, entity));
		const data = res.data.map(row => columns.map((c, i) => {
			if (c.type === 'time') {
				if (row[i] == null)
					return row[i];
				const date = new Date((row[i] as number) * 1e3);
				return isNaN(date.getTime()) ? null : date;
			}
			if (c.type.endsWith('[]')) {
				return row[i] == null || (row[i] as any).length < 1 ? null : (row[i] as string[]).join(',')
			}
			return row[i];
		}));

		return {
			columns, data: data as any,
			markers: null,
			includeMarkers: null
		};
	});
	console.log(query.data)
	if (query.error)
		return <div className='Center'>FAILED TO LOAD</div>;
	if (!query.data)
		return null;

	return <TableViewContext.Provider value={query.data}>

	</TableViewContext.Provider>
}