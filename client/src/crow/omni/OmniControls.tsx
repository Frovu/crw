import { useMemo, useState } from 'react';
import { useCrowWindowDebounced } from '../core/crowSettings';
import { omniGroups, omniSourceOptions, omniSources, omniVariables } from '../../api';
import { apiGet, apiPost, cn } from '../../util';
import { Button } from '../../components/Button';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { color, logError, logSuccess } from '../../app/app';
import CoveragePlot from '../../plots/CoveragePlot';

const groupOptions = ['*ALL', ...omniGroups] as const;
const scId = {
	1: 'HEOS',
	51: 'WIND',
	52: 'WIND',
	45: 'IMP8',
	50: 'IMP8',
	13: 'ISEE3',
	33: 'AIMP1',
	35: 'AIMP2',
	34: 'IMP4',
	3: 'VELA3',
	71: 'ACE',
	81: 'DSCOVR',
	99: 'other',
	0: 'none',
} as const;
const scColor = {
	HEOS: color('yellow'),
	IMP8: color('yellow'),
	IMP4: color('blue'),
	ISEE3: color('skyblue'),
	VELA3: color('blue'),
	AIMP1: color('skyblue'),
	AIMP2: color('skyblue'),
	WIND: color('yellow'),
	ACE: color('cyan'),
	DSCOVR: color('blue'),
	other: color('text'),
	none: color('red'),
} as const;

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
				cols.map((name, i) => {
					if (name === 'time') return [name, rows.map((r) => r[i])];
					if (name.startsWith('sc_id'))
						return [
							name.split('_').at(-1)!.toUpperCase(),
							rows.map((r) => (r[1] == null ? 0 : scId[r[1] as 0] ? r[1] : 99)),
						];
					return [name, rows.map((r) => (r[i] == null ? 0 : 1))];
				}),
			);
			console.log('omni controls =>', data);
			return data as { [key: string]: number[] };
		},
	});

	const scCounts = useMemo(() => {
		if (!query.data) return null;
		return Object.fromEntries(
			(['IMF', 'SW'] as const)
				.filter((g) => query.data[g])
				.map((group) => [
					group,
					query.data[group].reduce(
						(acc, val) => {
							acc[scId[val as 0]] = (acc[scId[val as 0]] ?? 0) + 1;
							return acc;
						},
						{} as { [k: string]: number },
					),
				]),
		);
	}, [query.data]);

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
			{scCounts &&
				query.data &&
				Object.entries(scCounts).map(([group, counts]) => (
					<div key={group}>
						<div className="flex gap-2 pl-6">
							<div className="w-8 text-right">{group}:</div>
							{Object.entries(counts)
								.toSorted((a, b) => b[1] - a[1])
								.map(([sc, count]) => (
									<div style={{ color: scColor[sc as keyof typeof scColor] }}>
										{Math.floor((count / query.data.time.length) * 100) || 1}% {sc.toUpperCase()}
									</div>
								))}
						</div>
						<CoveragePlot
							className="h-4 ml-14"
							time={query.data.time}
							data={query.data[group]}
							color={Object.fromEntries(Object.keys(scId).map((sc) => [sc, scColor[scId[sc as any as 0]]]))}
						/>
					</div>
				))}
			<div className="overflow-y-scroll grow pt-1">
				{query.data &&
					Object.keys(query.data)
						.filter((name) => name !== 'time' && !['IMF', 'SW'].includes(name as 'IMF'))
						.map((name) => (
							<div key={name} title={name} className="w-full text-xs hover:text-cyan flex items-center">
								<div className="w-14 break-all leading-2.5 text-center">{name}</div>
								<CoveragePlot
									className="grow h-3"
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
