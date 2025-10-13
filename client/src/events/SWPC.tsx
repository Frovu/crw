import { useState, type MouseEvent } from 'react';
import { read, utils } from 'xlsx';

type XLSRow = {
	Date: string,
	__EMPTY_26?: string,
	__EMPTY_27?: string,
};

function Menu() {
	const [data, setData] = useState<(string|null)[][] | null>(null);

	const onFileChange = (ab: ArrayBuffer) => {
		const wb = read(ab, { dateNF:'yyyy-mm-dd' });
		const ws = wb.Sheets[wb.SheetNames[0]];
		const json = utils.sheet_to_json(ws, { rawNumbers: false }) as XLSRow[];
		const result = json.map(row => [
			row.Date,
			row.__EMPTY_26 ?? null,
			row.__EMPTY_27 ?? null
		]);
		setData(result);

	};

	const onClick = (e: MouseEvent) => {
		e.stopPropagation();
	};

	return <>
		<input type='file' onChange={(e) => e.target.files?.[0]?.arrayBuffer().then(onFileChange).catch(() => {})}/>
		<button className='TextButton' disabled={!data} onClick={onClick}>Imprt SWPC data</button>
	</>;
}

function Panel() {
	return <div>
		test
	</div>;
}

export const SWPCHint = {
	name: 'SWPC Hint',
	Menu,
	Panel,
};