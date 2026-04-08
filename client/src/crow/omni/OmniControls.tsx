import { useState } from 'react';
import { useCrowWindowDebounced } from '../core/crowSettings';
import { omniGroups, omniSourceOptions, omniSources, omniVariables } from '../../api';
import { apiGet, apiPost, cn } from '../../util';
import { Button } from '../../components/Button';
import { Checkbox } from '../../components/Checkbox';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { color, logError, logSuccess } from '../../app/app';
import CoveragePlot from '../../plots/CoveragePlot';

const groupOptions = ['*ALL', ...omniGroups] as const;

function Menu() {
	return <></>;
}

function Panel() {
	const { start, end } = useCrowWindowDebounced();
	const queryClient = useQueryClient();
	const [groupState, setGroup] = useState<(typeof groupOptions)[number]>('*ALL');
	const [overwrite, setOverwrite] = useState(false);
	const groups = groupState === '*ALL' ? omniGroups : [groupState];
	const sourceOpts = [...new Set(groups.flatMap((gr) => omniSourceOptions[gr]))];

	const query = useQuery({
		queryKey: ['omniControls', start, end, JSON.stringify(groups)],
		queryFn: async () => {
			const fetchVars = omniVariables.filter(({ group }) => groups.includes(group as any));
			const { rows } = await apiGet<{ rows: (number | null)[][] }>('omni', {
				from: start,
				to: end,
				query: fetchVars.map((v) => v.name).join(','),
			});
			const cols = ['time', ...fetchVars.map((v) => v.name)];
			const data = Object.fromEntries(
				cols.map((name, i) => [name, rows.map((r) => (i === 0 ? r[i] : r[i] == null ? 0 : 1))]),
			);
			console.log('omni controls =>', data);
			return data;
		},
	});

	const { mutate: obtain } = useMutation({
		mutationFn: async (source: (typeof omniSources)[number]) => {
			const { message } = await apiPost('omni/obtain', {
				from: start,
				to: end,
				source,
				groups: groups.join(','),
				overwrite,
			});
			return message;
		},
		onSuccess: (msg) => {
			logSuccess(msg);
			queryClient.invalidateQueries({
				predicate: (q) =>
					!['tableData', 'compoundTable'].includes(q.queryKey[0] as any) &&
					!(q.queryKey[0] as any)?.includes?.('feid'),
			});
		},
		onError: (err: Error) => logError(err.toString()),
	});

	return (
		<div className="h-full text-sm flex flex-col">
			<div className="flex gap-[2px] p-[2px]">
				{groupOptions.map((opt) => (
					<Button
						key={opt}
						variant="default"
						className={cn('grow max-w-20', opt === groupState && 'font-bold text-cyan border-cyan')}
						onClick={() => setGroup(opt)}
					>
						{opt}
					</Button>
				))}
			</div>
			<div className="flex flex-wrap pl-1 pb-[2px] gap-[2px]">
				<Button
					title='If set to "overwrite": write all values (including gaps) from specified source, otherwise only write in gaps'
					className={cn('leading-3.5 pr-1', overwrite && 'text-magenta')}
					onClick={() => setOverwrite((ow) => !ow)}
				>
					{overwrite ? 'overwrite:' : 'fetch:'}
				</Button>
				{sourceOpts.map((src) => (
					<Button key={src} variant="default" className="grow basis-1 max-w-20" onClick={() => obtain(src)}>
						{src}
					</Button>
				))}
			</div>
			<div className="overflow-y-scroll grow">
				{query.data &&
					Object.keys(query.data)
						.filter((name) => name !== 'time' && !name.includes('_'))
						.map((name) => (
							<div key={name} title={name} className="text-xs hover:text-cyan flex items-center">
								<div className="w-14 break-all leading-2.5 text-center">{name}</div>
								<CoveragePlot
									className="w-100 h-3"
									time={query.data.time as number[]}
									data={query.data[name]}
									color={{ 0: color('red'), 1: color('green', 0.2) }}
								/>
							</div>
						))}
			</div>
		</div>
	);
}

export const OmniControls = {
	name: 'Omni Controls',
	Menu,
	Panel,
};
