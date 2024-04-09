import { useContext, useMemo } from 'react';
import { LayoutContext, type ContextMenuProps } from '../layout';
import { TableViewContext, type ColumnDef, type Value, type PanelParams, useViewState, valueToString } from './events';
import { useQueries, useQuery } from 'react-query';
import { apiGet } from '../util';
import { fromDesc } from './columns';
import TableView, { TableWithCursor } from './TableView';
import { color, logError } from '../app';

const TABLES = ['Eruptive Events', 'Flares', 'CMEs', 'ICMEs', 'Dimmings'];

export function SecTableContextMenu({ params, setParams }: ContextMenuProps<PanelParams>) {

	return <>
		<select style={{ border: 'transparent', textAlign: 'left' }}>
			{TABLES.map(t => <option key={t} value={t}>{t}</option>)}
		</select>
	</>;
}

type TableRes = { columns: ColumnDef[], data: (Value | string[])[][] }
const fetchTable = (entity: string) => async () => {
	const res = await apiGet<TableRes>('events', { entity });
	const columns = res.columns.map(desc => fromDesc(desc));
	for (const col of columns) {
		if (col.name === 'class')
			col.width = 7;
	}
	const data = res.data.map(row => [...columns.map((c, i) => {
		if (c.type === 'time') {
			if (row[i] == null)
				return row[i];
			const date = new Date((row[i] as number) * 1e3);
			return isNaN(date.getTime()) ? null : date;
		}
		if (c.type.endsWith('[]')) {
			return row[i] == null || (row[i] as any).length < 1 ? null : (row[i] as string[]).join(',');
		}
		return row[i];
	})]);
	return { columns, data };
}

const sources = ['SFT', 'DEM', 'DON'];
export function FlaresTable() {
	const { cursor } = useViewState();

	const { id: nodeId, params, size } = useContext(LayoutContext)!;
	const queries = useQueries([
		{ queryKey: ['flares', 'solarsoft'], queryFn: fetchTable('solarsoft_flares'), staleTime: Infinity },
		{ queryKey: ['flares', 'solardemon'], queryFn: fetchTable('solardemon_flares'), staleTime: Infinity  },
		{ queryKey: ['flares', 'donki'], queryFn: fetchTable('donki_flares'), staleTime: Infinity },
		// { queryKey: ['flares', 'ab'], queryFn: fetchTable(''), staleTime: Infinity },
	]);

	const context = useMemo(() => {
		if (queries.some(q => !q.data))
			return null;
		const sCols = queries.map(q => q.data!.columns);
		const sData = queries.map(q => q.data!.data);
		const columns = [...new Map(Object.values(sCols).flatMap(cols => cols.map(c => [c.name, c]))).values()];
		const indexes = sources.map((src, srci) =>
			columns.map(c => sCols[srci].findIndex(sc => sc.name === c.name)));
		const data = sData.flatMap((rows, srci) => rows.map(row =>
			[sources[srci], ...indexes[srci].map(idx => idx < 0 ? null : row[idx])]));
		const tIdx = columns.findIndex(c => c.id === 'start_time') + 1;
		data.sort((a, b) => (a[tIdx] as Date)?.getTime() - (b[tIdx] as Date)?.getTime());

		return { columns: [{ id: 'source', name: 'SRC', description: '', fullName: 'soruce', width: 4.5 } as ColumnDef,
			...columns], data };
	}, [queries]);
	if (queries.some(q => q.isError))
		return <div className='Center' style={{ color: color('red') }}>ERROR</div>;
	if (!context)
		return <div className='Center'>LOADING..</div>;
	const { columns, data } = context;


	const rowsHeight = size.height - 42;
	const rowH = devicePixelRatio < 1 ? 23 + (2 / devicePixelRatio) : 24;
	const viewSize = Math.floor(rowsHeight / rowH);
	const hRem = rowsHeight % rowH;
	const trPadding = hRem > viewSize ? 1 : 0;
	const headerPadding = (hRem - viewSize * trPadding);

	return <TableWithCursor {...{

		data, columns, size, viewSize, entity: 'flares',
		thead: <tr>{columns.map((col) =>
			<td key={col.id} title={`[${col.name}] ${col.description}`} className='ColumnHeader'
				// onContextMenu={}
			>
				<div style={{ height: 20 + headerPadding, lineHeight: 1, fontSize: 15 }}>{col.name}</div>
			</td>)}
		</tr>,
		row: (row, idx, onClick) => <tr key={row[0]+row[1]?.getTime()+row[7]} style={{ height: 23 + trPadding, fontSize: 15 }}>
			{columns.map((column, cidx) => {
				const curs = (cursor?.row === idx && cidx === cursor?.column) ? cursor : null;
				const value = valueToString(row[cidx]);
				return <td key={column.id} title={`${column.fullName} = ${value}`}
					onClick={e => {
						onClick(idx, cidx);
					}}
					// onContextMenu={}
					style={{ borderColor: curs ? 'var(--color-active)' : 'var(--color-border)' }}>
					<span className='Cell' style={{ width: column.width + 'ch' }}>
						<div className='TdOver'/>
						{value}
					</span>
				</td>;
			})}
		</tr>
	}}/>;
}

export default function SecondaryTable() {
	const { id: nodeId, params, size } = useContext(LayoutContext)!;

	const entity = 'solarsoft_flares';

	// TODO: limit time
	const query = useQuery(['eventsCatalogue', entity], fetchTable(entity));

	if (query.error)
		return <div className='Center'>FAILED TO LOAD</div>;
	if (!query.data)
		return null;

	return <FlaresTable/>;
}