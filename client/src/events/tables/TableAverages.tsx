import { useContext, useMemo } from 'react';
import { openContextMenu } from '../../app';
import type { TableColumn } from './Table';
import type { TableValue } from '../core/editableTables';
import { LayoutContext } from '../../layout';

export type TableAveragesData = { averages: (number[] | null)[]; label: string; row: number; column: number };

export function TableAverages({ columns, data }: { columns: TableColumn[]; data: TableValue[][] }) {
	const { id: nodeId } = useContext(LayoutContext)!;

	const sliceId = columns[0]?.sql_name === 'id' ? 1 : 0;

	return useMemo(() => {
		console.time('averages');
		const averages = columns.slice(sliceId).map((col, i) => {
			if (!['integer', 'real'].includes(col.dtype) || col.type === 'special') return null;
			const sorted = (data.map((row) => row[i + sliceId]).filter((v) => v != null) as number[]).sort((a, b) => a - b);
			if (!sorted.length) return null;
			const mid = Math.floor(sorted.length / 2);
			const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
			const sum = sorted.reduce((a, b) => a + b, 0);
			const n = sorted.length;
			const mean = sum / n;
			const std = Math.sqrt(sorted.map((x) => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
			const sem = std / Math.sqrt(n);
			return [median, mean, std, sem];
		});
		console.timeEnd('averages');

		return (
			<>
				<tr className="h-[3px]">
					<td colSpan={columns.length}></td>
				</tr>
				{['median', 'mean', 'σ', 'σ / √n'].map((label, ari) => (
					<tr key={label} className="text-[15px] h-[24px] *:border *:border-grid">
						{averages?.map((avgs, i) => {
							const column = columns[i + sliceId];
							const isLabel = column.dtype === 'time';
							const val = avgs?.[ari];
							return (
								<td
									key={column.sql_name}
									className={isLabel ? 'text-right px-[10px]' : 'text-center'}
									onContextMenu={openContextMenu('events', {
										nodeId,
										column,
										averages: {
											averages,
											label,
											row: ari,
											column: i,
										},
									})}
									title={(!isLabel && val?.toString()) || ''}
								>
									{isLabel ? label : val ? val.toFixed?.(ari > 2 ? 3 : avgs[1] > 99 ? 1 : 2) : ''}
								</td>
							);
						})}
					</tr>
				))}
			</>
		);
	}, [data, columns, sliceId, nodeId]);
}
