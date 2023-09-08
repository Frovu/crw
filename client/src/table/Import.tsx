import { useContext, useMemo, useState } from 'react';
import { TableContext } from './Table';

const FIXES = [
	[/(A|B|C|M|X) ([.\d]+)/g, '$1$2'],
	[/(\d)-\d9\d+/g, '$1 -9900'],
	[/(:\d\d:\d\d)([.\d-]+)/g, '$1 $2'],
	[/_*None_*/g, 'None']
] as [RegExp, string][];

type Parsed = {
	interval: [Date, Date],
};

export default function ImportMenu() {
	const { columns: allColumns } = useContext(TableContext);
	const [fileText, setFileText] = useState<string>();

	const parsed: { error?: string, parsed?: Parsed }|null = useMemo(() => {
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
		const rows: (Date|string|number|null)[][] = [...Array(lines.length)].map(r => Array(columns.length));

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
		console.log(columns, rows)

		return { parsed: {
			interval: [rows[0]?.[0], rows.at(-1)?.[0]] as any
		} };

	}, [allColumns, fileText]);

	return (<>
		<div className='PopupBackground'></div>
		<div className='Popup' style={{ left: 4, padding: 32, border: '2px var(--color-border) solid' }} onClick={e => e.stopPropagation()}>
			<h4 style={{ marginTop: 0 }}>Import FDs_fulltable</h4>
			<div style={{ margin: 8 }}>
				File: <input type='file' onChange={async (e) => setFileText(await e.target.files?.[0]?.text())}/>
			</div>
			{parsed?.error && <div style={{ maxWidth: 800, color: 'var(--color-red)' }}>Error: {parsed.error}</div> }
			{parsed?.parsed && (()=>{
				const { interval: [first, last] } = parsed.parsed;
				return (<div>
					<div style={{ margin: 8 }}>Target interval: {first?.toISOString().replace(/T.*/,'')} to {last?.toISOString().replace(/T.*/,'')}</div>
				</div>);
			})()}
		</div>
	</>);
}