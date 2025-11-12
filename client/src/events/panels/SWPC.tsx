import { useContext, useState, type MouseEvent } from 'react';
import { read, utils } from 'xlsx';
import { apiGet, apiPost, cn, prettyDate } from '../../util';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { logError, logSuccess } from '../../app';
import { LayoutContext } from '../../layout';
import { useFeidCursor } from '../core/eventsState';
import { useSolarPlot } from '../core/plot';

type ApiData = [number, string, string][];
type Data = (string | null)[][];
type XLSRow = {
	Date: string;
	__EMPTY_26?: string;
	__EMPTY_27?: string;
};

function Menu() {
	const [data, setData] = useState<Data | null>(null);

	const queryClient = useQueryClient();
	const { mutate, isPending } = useMutation({
		mutationFn: () => apiPost('events/swpc_summary', data!),
		onError: () => logError('Failed to import swpc data'),
		onSuccess: () => {
			logSuccess('Imported swpc data');
			queryClient.invalidateQueries({ queryKey: ['swpcSummary'] });
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
			<button className="TextButton" disabled={!data || isPending} onClick={onClick}>
				Import SWPC data
			</button>
		</>
	);
}

function Panel() {
	const { data } = useQuery({
		queryKey: ['swpcSummary'],
		queryFn: () => apiGet<ApiData>('events/swpc_summary'),
	});
	const {
		size: { width, height },
	} = useContext(LayoutContext)!;
	const { focusTime: timeSolar } = useSolarPlot();
	const { start: timeEarth } = useFeidCursor();
	const dates = [timeSolar, timeEarth].map((date) => Math.floor(date?.getTime() / 864e5) * 86400);

	if (!data) return <div className="center">LOADING</div>;

	const vertical = height / width > 1;

	return (
		<div className={cn('h-full grid', vertical ? 'grid-rows-2' : 'grid-cols-5')}>
			{[0, 1].map((side) => (
				<div className={cn('flex flex-col', side ? 'col-span-2' : 'col-span-3')}>
					{[-1, 0, 1].map((offset) => {
						const tstmp = dates[side] + 86400 * offset;
						const date = new Date(tstmp * 1e3);
						const text = data.find((r) => r[0] === tstmp)?.[side + 1];
						return (
							<div
								title={`${prettyDate(date, true)} ${side ? 'expected' : 'observed'}: ${text}`}
								className={cn(
									'flex grow basis-0 min-h-0 overflow-clip text-[11px]',
									offset !== 0 && 'text-text/80',
									(offset >= 0 || (vertical && side === 1)) && 'border-t-1',
									!vertical && side === 1 && 'border-l-1'
								)}
							>
								<div className="border-r-1 w-5 text-center pt-[2px]" style={{}}>
									{date.getDate()}
								</div>
								<div className="grow basis-0 p-[2px] leading-none">{text}</div>
							</div>
						);
					})}
				</div>
			))}
		</div>
	);
}

export const SWPCHint = {
	name: 'SWPC Hint',
	Menu,
	Panel,
};
