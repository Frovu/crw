import { useMemo, useState } from 'react';
import { equalValues, valueToString } from './events';
import { apiPost, useEventListener, useMutationHandler } from '../util';
import type { Value } from './columns';
import { useTable } from './eventsState';
import { color } from '../app';

const FIXES = [
	[/(A|B|C|M|X) ([.\d]+)/g, '$1$2'],
	[/_*None_*/g, 'None'],
	[/-91\s/g, '-999 ']
] as [RegExp, string][];

export default function ImportMenu() {
	const { columns: allColumns, data: currentData } = useTable();
	const [fileText, setFileText] = useState<string>();
	const [open, setOpen] = useState(false);
	const [importColumn, setImportColumn] = useState<string | null>(null);

	useEventListener('escape', () => setOpen(false));
	useEventListener('action+openImportMenu', () => setOpen(o => !o));

	const parsed = useMemo(() => {
		if (!fileText || !open) return null;
		console.time('parseFDs');

		const text = FIXES.reduce((txt, [re, ch]) => txt.replace(re, ch), fileText);
		const allLines = text.split('\n');
		const headerIdx = allLines.findIndex(l => l.includes('Date Time'));
		if (headerIdx < 0)
			return { error: 'columns index not found' };
		const colsIndex = allLines[headerIdx].trim().split(/\s+/);
		const columns = allColumns.filter(c => colsIndex.includes(c.parseName!))
			.map(c => ({ ...c , idx: colsIndex.indexOf(c.parseName!) }));
		const lines = allLines.slice(headerIdx + 1).filter(l => l.length > 0);
		const rows = [...Array(lines.length)].map(r => Array(columns.length)) as Value[][];

		for (const [ri, line] of lines.entries()) {
			try {
				const split = line.trim().split(/\s+/);
				if (split.length < colsIndex.length)
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
		const targetData = (currentData as Date[][]).filter(r => interval[0] <= r[timeIdx] && r[timeIdx] <= interval[1]) as any[];
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
				for (const [ci, { id, entity }] of columns.entries()) {
					if (importColumn && id !== importColumn)
						continue
					const oldVal = found[allColumns.findIndex(c => c.id === id)];
					const newVal = row[ci];
					if (id === 'duration' && (newVal === -99 || newVal as any > (oldVal as any))) // FIXME !!
						continue;
					if (equalValues(oldVal, newVal) ||
						(oldVal == null && [-999, -99, -99.9, 0, -1].includes(newVal as number)))
						continue;
					changes.push({
						entity,
						column: id,
						before: oldVal,
						after: newVal,
					});
				}

				const notAllNull = changes.find(({ entity, before, after }) => entity === 'forbush_effects'
					|| (before != null || typeof after != 'number') || ![-999, -99, -99.9, 0, 1, -1].includes(after));

				if (changes.length && notAllNull)
					diff.changes.push([found[0], time, changes]);
			} else {
				if (importColumn == null) {
					added.push(row);
					diff.added.push(time);
				}
			}
		}
		const actuallyLost = importColumn ? [] : lost.filter(l => !!l);
		diff.deleted = actuallyLost.map(l => l![timeIdx] as Date);

		console.timeEnd('parseFDs');
		
		return { parsed: {
			...diff,
			add: added,
			remove: actuallyLost.map(l => l![0]),
			total: rows.length,
			interval: interval as [Date, Date],
			columns: columns.map(c => c.id)
		} };

	}, [allColumns, currentData, importColumn, fileText, open]);

	const { report, mutate, isLoading } = useMutationHandler(({ columns, add, changes, remove }: NonNullable<NonNullable<typeof parsed>['parsed']>) =>
		apiPost('events/importTable', { columns, remove, add, changes: changes.map(([id, time, ch]) => [id, ch]) })
	, ['tableData']);

	return (!open ? null : <>
		<div className='PopupBackground'></div>
		<div className='Popup' style={{ left: 4, padding: '16px 32px 8px 32px', border: '2px var(--color-border) solid' }} onClick={e => e.stopPropagation()}>
			<h4 style={{ marginTop: 0 }}>Import FDs_fulltable</h4>
			<div style={{ margin: 8 }}>
				File: <input type='file' onChange={async (e) => setFileText(await e.target.files?.[0]?.text())}/>
			</div>
			<div style={{ color: color(importColumn ? 'text' : 'text-dark') }}>
				Only one column:
				<select style={{ maxWidth: 200, marginLeft: 8 }}
					value={importColumn ?? '<no>'}
					onChange={e => setImportColumn(e.target.value === '<no>' ? null : e.target.value)}>
						<option value="<no>">&lt;no&gt;</option>
						{allColumns.filter(c => c.id !== 'time' && c.parseName).map(col =>
							<option value={col.id} key={col.id}>{col.fullName} &lt;- {col.parseName}</option>)}
				</select>
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
							{added.map(dt => <div key={dt.getTime()}>+ {valueToString(dt)}</div>)}
						</div>}
					</div>
					<div style={{ display: 'inline-block', marginLeft: 16, }}>
						<div style={{ color: deleted.length ? 'var(--color-magenta)' : 'var(--color-text-dark)' }}>
							&nbsp;Lost: <b>{deleted.length}</b></div>
						{deleted.length > 0 && <div style={{ maxHeight: 64, padding: 4, overflowY: 'scroll', fontSize: 14, color: 'var(--color-magenta)' }}>
							{deleted.map(dt => <div key={dt.getTime()}>- {valueToString(dt)}</div>)}
						</div>}
					</div>
					<div style={{ color: changes.length ? 'var(--color-acid)' : 'var(--color-text-dark)', marginTop: 4 }}>
						Altered: {changes.length}</div>
					{changes.length > 0 && <div style={{ maxHeight: 160, marginTop: 8, overflowY: 'scroll', fontSize: 14, lineHeight: 1 }}>
						{changes.map(([_, date, list]) => <div key={date.getTime()} style={{ marginBottom: 12 }}>
							<span style={{ color: 'var(--color-acid)' }}>{valueToString(date)}</span>
							{list.map(({ entity, column, before, after }) =>
								<div style={{ marginLeft: 16 }} key={entity+column}>
									[{entity.replace(/([a-z])[a-z]+_?/ig, '$1')}.{column}] {before == null ? nihil : valueToString(before)}
									&nbsp;-&gt;&nbsp;<b>{after == null ? nihil : valueToString(after)}</b>
								</div> )}
						</div>)}
					</div>}
					<div style={{ margin: '8px 8px 4px 0' }}>
						<div style={{ color: report?.success ? 'var(--color-green)' : 'var(--color-red)', display: 'inline-block', height: '2.5em', width: 260, padding: 2 }}>
							{report?.error ?? report?.success ?? ''}</div>
						<button style={{ width: 110, margin: 4, verticalAlign: 'top' }} disabled={isLoading} onClick={() => mutate(parsed.parsed, {
							onSuccess: () => setTimeout(() => setOpen(false), 1000) as any
						})}>{isLoading ? '...' : '! Upsert !'}</button>
					</div>
				</div>);
			})()}
			<div className='CloseButton' style={{ position: 'absolute', top: 2, right: 8 }} onClick={() => setOpen(false)}/>
		</div>
	</>);
}