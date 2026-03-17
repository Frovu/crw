import { useMemo } from 'react';
import type { ChangelogEntry } from '../../api';
import { getChangelogEntry, useTablesStore, type EditableTable } from '../core/editableTables';
import { useEntityCursor } from '../core/eventsState';
import type { TableColumn } from './Table';

export function TableChangelog({ entity, columns }: { entity: EditableTable; columns: TableColumn[] }) {
	const cursor = useEntityCursor(entity);
	const { columns: allColumns } = useTablesStore()[entity];

	const changelog = useMemo(() => {
		if (cursor?.id == null) return null;

		const cursCol = columns[cursor.column].sql_name;
		const changelogCols = allColumns.map((c) => [c.sql_name, getChangelogEntry(entity, cursor.id!, c.sql_name)]);
		const log = changelogCols
			.filter((c) => !!c[1])
			.flatMap(([col, chgs]) => (chgs as ChangelogEntry[]).map((c) => ({ column: col as string, ...c })))
			.sort((a, b) => b.time - a.time)
			.sort((a, b) => (cursCol === b.column ? 1 : 0) - (cursCol === a.column ? 1 : 0));

		if (log.length < 1) return null;

		return log.map((change) => {
			const column = columns.find((c) => c.sql_name === change.column);
			const time = new Date(change.time * 1e3).toISOString();
			const timeShort = time.replace(/\..*|T/g, ' ').slice(0, -4);
			const value = (val: string | null) => {
				if (val == null) return 'null';
				if (column?.dtype === 'time') return new Date(parseInt(val) * 1e3).toISOString().replace(/\..*|T/g, ' ');
				return val;
			};

			return (
				<div key={JSON.stringify(change)} className="m-0">
					<i className="text-dark">
						[{timeShort}] @{change.author}{' '}
					</i>
					<i className={cursCol === column?.sql_name ? 'text-active' : ''}>
						{' '}
						<b>{column?.name ?? change.column}</b>
					</i>
					: {value(change.old)} -&gt; <b>{value(change.new)}</b>
					{change.special && <i className="text-dark"> ({change.special})</i>}
				</div>
			);
		});
	}, [cursor, columns, allColumns, entity]);

	return (
		<div className="relative flex flex-col-reverse overflow-y-scroll h-[60px] mt-[2px] p-1 border text-xs">
			{changelog ?? <div className="center text-dark text-base">NO CHANGES</div>}
		</div>
	);
}
