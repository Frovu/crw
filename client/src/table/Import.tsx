import { useContext, useMemo, useState } from 'react';
import { TableContext, equalValues, valueToString } from './Table';

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
			changes: [] as [Date, { name: string, before: typeof rows[number][number], after: typeof rows[number][number] }[]][]
		};
		const timeIdx = allColumns.findIndex(c => c.fullName === 'time');
		const targetData = currentData.filter(r => interval[0] <= (r[timeIdx] as Date) && (r[timeIdx] as Date) <= interval[1]);
		for (const row of rows) {
			const time = row[0] as Date;
			const found = targetData.find(r => (r[timeIdx] as Date).getTime() === time.getTime());
			if (found) {
				++diff.found;
				const changes: typeof diff.changes[number][1] = [];
				for (const [ci, { id, fullName }] of columns.entries()) {
					const oldVal = found[allColumns.findIndex(c => c.id === id)];
					const newVal = row[ci];
					if (equalValues(oldVal, newVal) || (oldVal == null && newVal === 0))
						continue;
					changes.push({
						name: fullName,
						before: oldVal == null ? null : valueToString(oldVal),
						after: newVal == null ? null : valueToString(newVal),
					});
				}
				if (changes.length)
					diff.changes.push([time, changes]);
			} else {
				diff.added.push(time);
			}
		}

		return { parsed: {
			...diff,
			total: rows.length,
			interval: interval as [Date, Date]
		} };

	}, [allColumns, currentData, fileText]);

	return (<>
		<div className='PopupBackground'></div>
		<div className='Popup' style={{ left: 4, padding: 32, border: '2px var(--color-border) solid' }} onClick={e => e.stopPropagation()}>
			<h4 style={{ marginTop: 0 }}>Import FDs_fulltable</h4>
			<div style={{ margin: 8 }}>
				File: <input type='file' onChange={async (e) => setFileText(await e.target.files?.[0]?.text())}/>
			</div>
			{parsed?.error && <div style={{ maxWidth: 800, color: 'var(--color-red)' }}>Error: {parsed.error}</div> }
			{parsed?.parsed && (()=>{
				const { interval: [first, last], found, total, added, deleted, changes } = parsed.parsed;
				const nihil = <span style={{ color: 'var(--color-text-dark)' }}><i>null</i></span>;
				return (<div style={{ textAlign: 'left', lineHeight: 1.5 }}>
					<div>Target interval: {first?.toISOString().replace(/T.*/,'')} to {last?.toISOString().replace(/T.*/,'')}</div>
					<div style={{ color: 'var(--color-text-dark)' }}>
						Found: {found} of {total}</div>
					<div style={{ color: added.length ? 'var(--color-cyan)' : 'var(--color-text-dark)' }}>
						Added: {added.length}</div>
					<div style={{ color: deleted.length ? 'var(--color-magenta)' : 'var(--color-text-dark)' }}>
						&nbsp;Lost: {deleted.length}</div>
					<div style={{ color: changes.length ? 'var(--color-acid)' : 'var(--color-text-dark)' }}>
						Altered: {changes.length}</div>
					{changes.length && <div style={{ maxHeight: 240, marginTop: 8, overflowY: 'scroll', fontSize: 14, lineHeight: 1 }}>
						{changes.map(([date, list]) => <div key={date.getTime()} style={{ marginBottom: 12 }}>
							<span style={{ color: 'var(--color-acid)' }}>{valueToString(date)}</span>
							{list.map(({ name, before, after }) =>
								<div style={{ marginLeft: 16 }}>
									[{name}] {before == null ? nihil : valueToString(before)}
									&nbsp;-&gt;&nbsp;<b>{after == null ? nihil : valueToString(after)}</b>
								</div> )}
						</div>)}
					</div>}
				</div>);
			})()}
		</div>
	</>);
}