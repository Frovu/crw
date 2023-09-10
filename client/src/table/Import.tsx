import { useContext, useMemo, useState } from 'react';
import { TableContext, equalValues, valueToString } from './Table';
import { apiPost, dispatchCustomEvent, useMutationHandler } from '../util';

const FIXES = [
	[/(A|B|C|M|X) ([.\d]+)/g, '$1$2'],
	[/(\d)-\d9\d+/g, '$1 -9900'],
	[/(:\d\d:\d\d)([.\d-]+)/g, '$1 $2'],
	[/_*None_*/g, 'None']
] as [RegExp, string][];

export default function ImportMenu() {
	const { columns: allColumns, data: currentData } = useContext(TableContext);
	const [fileText, setFileText] = useState<string>();

	const parsed = useMemo(() => {
		if (!fileText) return null;

		const text = FIXES.reduce((txt, [re, ch]) => txt.replace(re, ch), fileText);
		const allLines = text.split('\n');
		const headerIdx = allLines.findIndex(l => l.includes('Date Time'));
		if (headerIdx < 0)
			return { error: 'columns index not found' };
		const colsIndex = allLines[headerIdx].trim().split(/\s+/);
		const columns = allColumns.filter(c => colsIndex.includes(c.parseName!))
			.map(c => ({ ...c , idx: colsIndex.indexOf(c.parseName!) }));
		const lines = allLines.slice(headerIdx + 1).filter(l => l.length > 0);
		const rows: typeof currentData = [...Array(lines.length)].map(r => Array(columns.length));

		for (const [ri, line] of lines.entries()) {
			try {
				const split = line.trim().split(/\s+/);
				if (split.length !== colsIndex.length)
					return { error: `column count does not match (${split.length} != ${colsIndex.length}): ${line}` };
				for (const [ci, { name, idx, type, parseValue }] of columns.entries()) {
					const str = split[idx];
					if (parseValue) {
						rows[ri][ci] = parseValue[str] ?? null;
					} else if (str === 'None') {
						rows[ri][ci] = null;
					} else {
						if (type === 'time') {
							const dateStr = (split[idx-1] + 'T' + str)
								.replace(/T(\d):/, 'T0$1:').replace(/\./g, '-') + 'Z';
							const val = new Date(dateStr);
							if (isNaN(val.getTime()))
								return { error: `invalid ${name}: ${dateStr}  (${split[idx-1] + ' ' + str})` };
							rows[ri][ci] = val;
						} else if (['integer', 'real'].includes(type)) {
							const val = type === 'integer' ? parseInt(str) : parseFloat(str);
							if (isNaN(val))
								return { error: `invalid ${name} (NaN): ${str}` };
							rows[ri][ci] = val;
						} else if (['enum', 'text'].includes(type)) {
							rows[ri][ci] = str;
						} else {
							return { error: `type not supported: ${type}` };
						}
					}
				}
			} catch(e) {
				return { error: `failed to parse line: ${line}` };
			}
		}

		const interval = [rows[0]?.[0], rows.at(-1)?.[0]] as [Date, Date];
		const diff = {
			found: 0,
			added: [] as Date[],
			deleted: [] as Date[], 
			changes: [] as [number, Date, { entity: string, column: string, before: typeof rows[number][number], after: typeof rows[number][number] }[]][]
		};
		const timeIdx = allColumns.findIndex(c => c.fullName === 'time');
		const targetData = currentData.filter(r => interval[0] <= (r[timeIdx] as Date) && (r[timeIdx] as Date) <= interval[1]);
		const lost = targetData.slice() as (typeof rows[number][number][]|null)[];
		const added = [];
		for (const row of rows) {
			const time = row[0] as Date;
			const foundIdx = targetData.findIndex(r => (r[timeIdx] as Date).getTime() === time.getTime());
			if (foundIdx >= 0) {
				const found = targetData[foundIdx];
				++diff.found;
				lost[foundIdx] = null;
				const changes: typeof diff.changes[number][2] = [];
				for (const [ci, { id, sqlName, table }] of columns.entries()) {
					const oldVal = found[allColumns.findIndex(c => c.id === id)];
					const newVal = row[ci];
					if (equalValues(oldVal, newVal) || (oldVal == null && newVal === 0))
						continue;
					changes.push({
						entity: table,
						column: sqlName,
						before: oldVal,
						after: newVal,
					});
				}
				if (changes.length)
					diff.changes.push([found[0] as number, time, changes]);
			} else {
				added.push(row);
				diff.added.push(time);
			}
		}
		const actuallyLost = lost.filter(l => !!l);
		diff.deleted = actuallyLost.map(l => l![timeIdx] as Date);
		
		return { parsed: {
			...diff,
			add: added,
			remove: actuallyLost.map(l => l![0] as number),
			total: rows.length,
			interval: interval as [Date, Date],
			columns: columns.map(c => [ c.table, c.sqlName ] )
		} };

	}, [allColumns, currentData, fileText]);

	const { report, mutate, isLoading } = useMutationHandler(({ columns, add, changes, remove }: NonNullable<NonNullable<typeof parsed>['parsed']>) =>
		apiPost('events/importTable', { columns, remove, add, changes: changes.map(([id, time, ch]) => [id, ch]) })
	, ['tableData']);

	return (<>
		<div className='PopupBackground'></div>
		<div className='Popup' style={{ left: 4, padding: '16px 32px 8px 32px', border: '2px var(--color-border) solid' }} onClick={e => e.stopPropagation()}>
			<h4 style={{ marginTop: 0 }}>Import FDs_fulltable</h4>
			<div style={{ margin: 8 }}>
				File: <input type='file' onChange={async (e) => setFileText(await e.target.files?.[0]?.text())}/>
			</div>
			{parsed?.error && <div style={{ maxWidth: 800, color: 'var(--color-red)' }}>Error: {parsed.error}</div> }
			{parsed?.parsed && (()=>{
				const { interval: [first, last], found, total, added, deleted, changes } = parsed.parsed;
				const nihil = <span style={{ color: 'var(--color-text-dark)' }}><i>null</i></span>;
				return (<div style={{ textAlign: 'left', lineHeight: 1.5 }}>
					<div>Target table: forbush_effects</div>
					<div>Target interval: <b>{first?.toISOString().replace(/T.*/,'')} to {last?.toISOString().replace(/T.*/,'')}</b></div>
					<div style={{ color: 'var(--color-text-dark)' }}>
						Found: {found} of {total}</div>
					<div style={{ display: 'inline-block' }}>
						<div style={{ color: added.length ? 'var(--color-cyan)' : 'var(--color-text-dark)' }}>
							Added: <b>{added.length}</b></div>
						{added.length > 0 && <div style={{ maxHeight: 64, padding: 4, overflowY: 'scroll', fontSize: 14, color: 'var(--color-cyan)' }}>
							{added.map(dt => <div>+ {valueToString(dt)}</div>)}
						</div>}
					</div>
					<div style={{ display: 'inline-block', marginLeft: 16, }}>
						<div style={{ color: deleted.length ? 'var(--color-magenta)' : 'var(--color-text-dark)' }}>
							&nbsp;Lost: <b>{deleted.length}</b></div>
						{deleted.length > 0 && <div style={{ maxHeight: 64, padding: 4, overflowY: 'scroll', fontSize: 14, color: 'var(--color-magenta)' }}>
							{deleted.map(dt => <div>- {valueToString(dt)}</div>)}
						</div>}
					</div>
					<div style={{ color: changes.length ? 'var(--color-acid)' : 'var(--color-text-dark)', marginTop: 4 }}>
						Altered: {changes.length}</div>
					{changes.length > 0 && <div style={{ maxHeight: 160, marginTop: 8, overflowY: 'scroll', fontSize: 14, lineHeight: 1 }}>
						{changes.map(([_, date, list]) => <div key={date.getTime()} style={{ marginBottom: 12 }}>
							<span style={{ color: 'var(--color-acid)' }}>{valueToString(date)}</span>
							{list.map(({ entity, column, before, after }) =>
								<div style={{ marginLeft: 16 }}>
									[{entity.replace(/([a-z])[a-z]+_?/ig, '$1')}.{column}] {before == null ? nihil : valueToString(before)}
									&nbsp;-&gt;&nbsp;<b>{after == null ? nihil : valueToString(after)}</b>
								</div> )}
						</div>)}
					</div>}
					<div style={{ margin: '8px 8px 4px 0' }}>
						<div style={{ color: report?.success ? 'var(--color-green)' : 'var(--color-red)', display: 'inline-block', height: '2.5em', width: 260, padding: 2 }}>
							{report?.error ?? report?.success ?? ''}</div>
						<button style={{ width: 110, margin: 4, verticalAlign: 'top' }} onClick={() => mutate(parsed.parsed, {
							onSuccess: () => setTimeout(() => dispatchCustomEvent('escape'), 1000) as any
						})}>{isLoading ? '...' : '! Upsert !'}</button>
					</div>
				</div>);
			})()}
		</div>
	</>);
}