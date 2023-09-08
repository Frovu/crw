import { useContext, useMemo, useState } from 'react';
import { ColumnDef, TableContext } from './Table';

type Parsed = {
	interval: [Date, Date],
};
export default function ImportMenu() {
	const { columns: allColumns } = useContext(TableContext);
	const [fileText, setFileText] = useState<string>();

	const parsed: { error?: string, parsed?: Parsed }|null = useMemo(() => {
		if (!fileText) return null;

		const allLines = fileText.split('\n');
		const headerIdx = allLines.findIndex(l => l.includes('Date Time'));
		if (headerIdx < 0)
			return { error: 'columns index not found' };
		const colsIndex = allLines[headerIdx].trim().split(/\s+/);
		const columns = allColumns.filter(c => colsIndex.includes(c.parseName!))
			.map(c => ({ ...c , idx: colsIndex.indexOf(c.parseName!) }))
			
			.slice(0,2);
		const lines = allLines.slice(headerIdx + 1).filter(l => l.length > 0);
		const rows: (Date|string|number|null)[][] = [...Array(lines.length)].map(r => Array(columns.length));

		for (const [i, line] of lines.entries()) {
			try {
				const split = line.trim().split(/\s+/);
				if (split.length !== colsIndex.length)
					return { error: `column count does not match (${split.length} != ${colsIndex.length}): ${line}` };
				for (const col of columns) {
					const str = split[col.idx];
					if (col.type === 'time') {
						const dateStr = (split[col.idx-1] + 'T' + str).replace(/T(\d):/, 'T0$1:').replace(/\./g, '-') + 'Z';
						const val = new Date(dateStr);
						if (isNaN(val.getTime()))
							return { error: `invalid date: ${dateStr}  (${split[col.idx-1] + ' ' + str})` };
						rows[i][0] = val;
					}
				}
			} catch(e) {
				return { error: `failed to parse line: ${line}` };
			}
	
		}

		return { parsed: {
			interval: [rows[0]?.[0], rows.at(-1)?.[0]] as any
		} };

	}, [allColumns, fileText]);
	console.log(parsed)

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