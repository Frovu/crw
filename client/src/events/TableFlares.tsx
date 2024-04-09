import { useContext, useMemo } from 'react';
import { useQueries } from 'react-query';
import { LayoutContext } from '../layout';
import { TableWithCursor } from './TableView';
import { fetchTable } from './columns';
import { useViewState, type ColumnDef, valueToString } from './events';
import { color } from '../app';

const columnOrder = ['class', 'lat', 'lon', 'AR', 'start', 'peak', 'end'];
const timeIdx = 5;
const sources = ['SFT', 'DKI', 'dMN'] as const;

const defaultParams = {
	
}

export default function FlaresTable() {
	const { cursor } = useViewState();

	const { id: nodeId, params, size } = useContext(LayoutContext)!;
	const queries = useQueries([
		{ queryKey: ['solarsoft_flares'], queryFn: fetchTable('solarsoft_flares'), staleTime: Infinity },
		{ queryKey: ['donki_flares'], queryFn: fetchTable('donki_flares'), staleTime: Infinity },
		{ queryKey: ['solardemon_flares'], queryFn: fetchTable('solardemon_flares'), staleTime: Infinity  },
		// { queryKey: ['flares', 'ab'], queryFn: fetchTable(''), staleTime: Infinity },
	]);

	const context = useMemo(() => {
		if (queries.some(q => !q.data))
			return null;
		const sCols = queries.map(q => q.data!.columns);
		const sData = queries.map(q => q.data!.data);
		const pairs = Object.values(sCols).flatMap(cols => cols.map(c => [c.name, c]));
		const columns = [...new Map([...columnOrder.map(cn => [cn, null]) as any, ...pairs]).values()] as ColumnDef[];
		const indexes = sources.map((src, srci) =>
			columns.map(c => sCols[srci].findIndex(sc => sc.name === c.name)));
		const data = sData.flatMap((rows, srci) => rows.map(row =>
			[sources[srci], ...indexes[srci].map(idx => idx < 0 ? null : row[idx])]));
		const tIdx = columns.findIndex(c => c.id === 'start_time') + 1;
		data.sort((a, b) => (a[tIdx] as Date)?.getTime() - (b[tIdx] as Date)?.getTime());

		for (const col of columns) {
			if (col.name.includes('class'))
				col.width = 5.5;
			if (['lat', 'lon'].includes(col.name))
				col.width = 4.5;
		}

		return { columns: [{ id: 'src', name: 'src', description: '', fullName: 'src', width: 4.5 } as ColumnDef,
			...columns], data };
	}, [queries[0]?.data, queries[1]?.data, queries[2]?.data]); // eslint-disable-line
	if (queries.some(q => q.isError))
		return <div className='Center' style={{ color: color('red') }}>ERROR</div>;
	if (!context)
		return <div className='Center'>LOADING..</div>;
	const { columns, data } = context;

	const rowsHeight = size.height - 28;
	const rowH = devicePixelRatio < 1 ? 24 + (2 / devicePixelRatio) : 25;
	const viewSize = Math.floor(rowsHeight / rowH);
	const hRem = rowsHeight % rowH;
	const trPadding = hRem > viewSize ? 1 : 0;
	const headerPadding = (hRem - viewSize * trPadding);

	return <TableWithCursor {...{

		data, columns, size, viewSize, entity: 'flares',
		thead: <tr>{columns.map((col) =>
			<td key={col.id} title={`[${col.name}] ${col.description ?? ''}`} className='ColumnHeader'
				// onContextMenu={}
			>
				<div style={{ height: 20 + headerPadding, lineHeight: 1, fontSize: 15 }}>{col.name}</div>
			</td>)}
		</tr>,
		row: (row, idx, onClick) => {
			const stime = row[timeIdx];
			return <tr key={row[0]+stime?.getTime()+row[timeIdx+2]?.getTime()}
				style={{ height: 23 + trPadding, fontSize: 15 }}>
				{columns.map((column, cidx) => {
					const isFar = false; 
					const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
					const value = valueToString(row[cidx]);
					return <td key={column.id} title={`${column.fullName} = ${value}`}
						onClick={e => {
							onClick(idx, cidx);
						}}
						// onContextMenu={}
						style={{ borderColor: curs ? 'var(--color-active)' : 'var(--color-border)' }}>
						<span className='Cell' style={{ width: column.width + 'ch', color: color('text-dark')  }}>
							<div className='TdOver'/>
							{value}
						</span>
					</td>;
				})}
			</tr>;}
	}}/>;
}