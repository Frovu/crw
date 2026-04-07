import { useState } from 'react';
import { useCrowWindowDebounced } from '../core/crowSettings';
import { omniGroups, omniSourceOptions, omniSources, omniVariables } from '../../api';
import { apiPost, cn } from '../../util';
import { Button } from '../../components/Button';
import { Checkbox } from '../../components/Checkbox';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { logError, logSuccess } from '../../app/app';

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
		<div className="overflow-y-scroll max-h-full text-sm">
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
			<div className="flex flex-wrap pl-1 gap-[2px]">
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
			<div>
				{omniVariables
					.filter(({ group, name }) => groups.includes(group as any) && !name.includes('_'))
					.map(({ name }) => (
						<div className="text-xs">{name}</div>
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
