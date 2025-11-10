import { useContext } from 'react';
import { TableViewContext, valueToString } from './events';
import { computeColumnWidth } from './columns/columns';

export function ExportMenu() {
	const { data: shownData, columns: allColumns, includeMarkers: inc } = useContext(TableViewContext);

	const columns = inc
		? allColumns.concat({
				fullName: 'SAMPLE',
				type: 'text',
				description: 'Included in these samples (separated by ;)',
				width: 16,
		  } as any)
		: allColumns;

	const renderText = (format: 'json' | 'csv' | 'txt') => {
		const data = shownData.map((row, i) => (!inc ? row.slice(1) : row.slice(1).concat(inc[i])));
		const cols = columns.map(({ name, dtype, description, enum: aenum }) => ({
			name,
			dtype,
			description,
			enum: aenum,
		}));

		if (format === 'json') {
			return JSON.stringify({ columns: cols, data }, null, 2);
		} else if (format === 'txt') {
			let text =
				'Note: plaintext export option has limitations and one should consider using JSON instead' +
				'\r\nAll whitespace in values is replaced by _, missing values are marked as N/A\r\n';
			const widths = columns.map(computeColumnWidth);
			text += columns.map((col, i) => col.name.replace(/\s/g, '_').padStart(widths[i], ' '.repeat(widths[i]))).join(' ') + '\r\n';
			for (const row of data) {
				for (const [i] of columns.entries()) {
					const v = row[i];
					const val = v instanceof Date ? v?.toISOString().replace(/\..+/, 'Z') : v;
					text +=
						(val == null ? 'N/A' : val)
							.toString()
							.replace(/\s/g, '_')
							.padStart(widths[i] + (i === 0 ? 0 : 4), ' '.repeat(widths[i])) + ' ';
				}
				text += '\r\n';
			}
			return text;
		} else if (format === 'csv') {
			const head = columns.map((col) => col.name).join(',');
			return [head].concat(data.map((row) => row.map((v) => valueToString(v)).join(','))).join('\r\n');
		}
		return '';
	};

	const doExport = (format: 'json' | 'csv' | 'txt', copy?: boolean) => () => {
		if (copy) return navigator.clipboard.writeText(renderText(format));
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([renderText(format)]));
		a.download = `feid.${format}`;
		a.click();
	};

	return (
		<div style={{ maxWidth: 240, padding: '2px 8px' }}>
			<button className="TextButton" onClick={doExport('json')}>
				Download json
			</button>
			<button className="TextButton" onClick={doExport('txt')}>
				Download txt
			</button>
			<button className="TextButton" onClick={doExport('csv')}>
				Download csv
			</button>
			<button className="TextButton" onClick={doExport('csv', true)}>
				Copy csv to clipboard
			</button>
			<div className="separator" style={{ margin: '6px 0' }}></div>
			<div style={{ color: 'var(--color-text-dark)', fontSize: 12 }}>
				Note that table is exported as it is currently visible: respecting selected sample, filters and enabled columns
			</div>
		</div>
	);
}
