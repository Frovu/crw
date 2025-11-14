import type { TableEntity } from './Table';

const getChangelogEntry = (chl: ChangelogResponse | undefined, eid: number, cid: string) =>
	chl?.events[eid]?.[cid]?.map((row) => Object.fromEntries(chl.fields.map((f, i) => [f, row[i]]))) as
		| ChangelogEntry[]
		| undefined;

export function TableChangelog<T extends TableEntity>(ent: T) {
	const changelogCols =
		(showChangelog || null) &&
		cursor &&
		wholeChangelog &&
		data[cursor.row] &&
		columns.map((c) => [c.sql_name, getChangelogEntry(wholeChangelog, data[cursor.row][0], c.sql_name)]);
	const changelog = changelogCols
		?.filter((c) => !!c[1])
		.flatMap(([col, chgs]) => (chgs as ChangelogEntry[]).map((c) => ({ column: col, ...c })))
		.sort((a, b) => b.time - a.time)
		.sort((a, b) => (cursCol === b.column ? 1 : 0) - (cursCol === a.column ? 1 : 0));
}
