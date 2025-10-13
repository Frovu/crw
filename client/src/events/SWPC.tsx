import { useState, type MouseEvent } from 'react';
import { read, utils } from 'xlsx';
import { apiPost } from '../util';
import { useMutation, useQueryClient } from 'react-query';
import { logError, logSuccess } from '../app';

type Data = (string | null)[][];
type XLSRow = {
	Date: string;
	__EMPTY_26?: string;
	__EMPTY_27?: string;
};

function Menu() {
	const [data, setData] = useState<Data | null>(null);

	const queryClient = useQueryClient();
	const { mutate, isLoading } = useMutation({
		mutationFn: () => apiPost('events/swpc_summary', data!),
		onError: () => logError('Failed to import swpc data'),
		onSuccess: () => {
			logSuccess('Imported swpc data');
			queryClient.invalidateQueries(['swpcSummary']);
		},
	});

	const onFileChange = (ab: ArrayBuffer) => {
		const wb = read(ab, { dateNF: 'yyyy-mm-dd' });
		const ws = wb.Sheets[wb.SheetNames[0]];
		const json = utils.sheet_to_json(ws, { rawNumbers: false }) as XLSRow[];
		const result = json.map((row) => [row.Date, row.__EMPTY_26 ?? null, row.__EMPTY_27 ?? null]);

		// deduplicate
		const found: any = {};
		for (const r of result as any) {
			if (found[r[0]]) console.log('duplicate!!!', r, found[r[0]]);
			found[r[0]] = r;
		}

		setData(Object.values(found));
	};

	const onClick = (e: MouseEvent) => {
		e.stopPropagation();
		mutate();
	};

	return (
		<>
			<input
				type="file"
				onChange={(e) =>
					e.target.files?.[0]
						?.arrayBuffer()
						.then(onFileChange)
						.catch(() => {})
				}
			/>
			<button className="TextButton" disabled={!data || isLoading} onClick={onClick}>
				Import SWPC data
			</button>
		</>
	);
}

function Panel() {
	return <div>test</div>;
}

export const SWPCHint = {
	name: 'SWPC Hint',
	Menu,
	Panel,
};
