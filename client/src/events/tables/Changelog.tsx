import { useMemo } from 'react';
import type { ChangelogResponse, ChangelogEntry } from '../../api';
import { useTablesStore, type EditableTable } from '../core/editableTables';
import { useEntityCursor } from '../core/eventsState';
import type { TableColumn } from './Table';

const getChangelogEntry = (chl: ChangelogResponse | undefined, eid: number, cid: string) =>
	chl?.events[eid]?.[cid]?.map((row) => Object.fromEntries(chl.fields.map((f, i) => [f, row[i]]))) as
		| ChangelogEntry[]
		| undefined;

export function TableChangelog({ entity, columns }: { entity: EditableTable; columns: TableColumn[] }) {
	const cursor = useEntityCursor(entity);
	const { changelog: wholeChangelog, columns: allColumns } = useTablesStore()[entity];

	const changelog = useMemo(() => {
		if (!cursor?.id || !wholeChangelog) return null;

		const cursCol = columns[cursor.column].sql_name;
		const changelogCols = allColumns.map((c) => [c.sql_name, getChangelogEntry(wholeChangelog, cursor.id!, c.sql_name)]);
		const log = changelogCols
			?.filter((c) => !!c[1])
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
					<i style={{ color: 'var(--color-dark)' }}>
						[{timeShort}] @{change.author}{' '}
					</i>
					<i className={cursCol === column?.sql_name ? 'text-active' : ''}>
						{' '}
						<b>{column?.name ?? change.column}</b>
					</i>
					: {value(change.old)} -&gt; <b>{value(change.new)}</b>
					{change.special && <i style={{ color: 'var(--color-dark)' }}> ({change.special})</i>}
				</div>
			);
		});
	}, [columns, allColumns, cursor, wholeChangelog]);

	return (
		<div className="relative flex flex-col-reverse overflow-y-scroll h-[60px] mt-[2px] p-1 border text-xs">
			{changelog ?? <div className="center text-dark text-base">NO CHANGES</div>}
		</div>
	);
}
