import { forwardRef, useContext, useRef, useState } from 'react';
import { AuthContext, logError, logMessage } from '../../app/app';
import { apiPost, cn, dispatchCustomEvent, prettyDate, useEventListener } from '../../util';
import { useSampleState, applySample } from './sample';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { withConfirmation } from '../../components/Confirmation';
import { type Sample } from '../../api';
import { useTable } from '../core/editableTables';
import { useFeidSample } from '../core/feid';
import {
	Select,
	SelectContent,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
	SelectItem,
	SimpleSelect,
} from '../../components/Select';
import { Button, CloseButton } from '../../components/Button';
import { Input, TextInput } from '../../components/Input';
import { FilterCard } from './Filters';
import { Checkbox } from '../../components/Checkbox';

function IncludeCard({ sampleId: id, disabled }: { sampleId: number | null; disabled?: boolean }) {
	const { samples } = useFeidSample();
	const { changeInclude, removeInclude, current } = useSampleState();

	if (!samples) return null;

	const blank = id === null;
	const opts = samples.filter((s) => s.id !== current?.id && (s.id === id || !current?.includes?.includes(s.id)));
	const sample = samples.find((s) => s.id === id);

	return (
		<div className="flex gap-1 items-center">
			{!blank && <span className="text-dark text-sm">include</span>}
			{!blank && !sample && <span className="text-red text-sm">DELETED</span>}
			{(blank || sample) && (
				<SimpleSelect
					className="max-w-42"
					placeholder="include sample"
					options={opts.map(({ id: s, name }) => [s, name])}
					onChange={(val) => changeInclude(id, val!)}
					value={id ?? null}
				/>
			)}
			{id && !disabled && <CloseButton className="w-6" onClick={() => removeInclude(id)} />}
		</div>
	);
}

const SampleView = forwardRef<HTMLDivElement>((props, ref) => {
	const queryClient = useQueryClient();
	const { data: tableData, columns } = useTable('feid');
	const { samples } = useFeidSample();
	const { login, role } = useContext(AuthContext);
	const {
		current: sample,
		filters,
		isPicking,
		showDetails: show,
		set,
		setSample,
		setPicking,
		setShow,
		clearFilters,
	} = useSampleState();
	const [hoverAuthors, setHoverAuthors] = useState(0);
	const [nameInput, setNameInput] = useState<string | null>(null);
	const toDelete = useRef<Sample | null>(null);

	const { mutate, isPending } = useMutation({
		mutationFn: async ({ action, ow }: { action: 'create' | 'remove' | 'update' | 'copy'; ow?: Sample }) =>
			apiPost<typeof action extends 'remove' ? { message?: string } : Sample>(
				`events/samples/${['copy'].includes(action) ? 'create' : action}`,
				(() => {
					switch (action) {
						case 'copy':
							return {
								name: newName(0, sample!.name),
								filters: [],
							};
						case 'create':
							return {
								name: newName(),
								filters: filters.map(({ column, operation, value }) => ({ column, operation, value })),
							};
						case 'remove':
							return { id: ow?.id ?? sample?.id };
						case 'update':
							return ow ? ow : (stripFilters ?? {});
					}
				})(),
			),
		onSuccess: () => queryClient.refetchQueries({ queryKey: ['samples'] }),
		onError: logError,
	});

	useEventListener('escape', () => setNameInput(null));

	if (!samples) return null;

	const newName = (i: number = 0, n?: string): string => {
		const name = (n ? n + ' Copy #' : 'New Sample #') + i;
		return samples.find((s) => s.name === name) ? newName(i + 1, n) : name;
	};
	const stripFilters = sample && {
		...sample,
		filters: sample.filters?.map(({ column, operation, value }) => ({ column, operation, value })) ?? [],
	};

	const deleteSample = () =>
		withConfirmation('', 'Sample deletion is irreversible. Proceed?', () =>
			mutate(
				{ action: 'remove', ow: toDelete.current ?? sample! },
				{
					onSuccess: () => {
						logMessage('Sample deleted: ' + (toDelete.current ?? sample)?.name);
						toDelete.current = null;
						setSample(null);
					},
				},
			),
		);

	const createSample = () =>
		mutate(
			{ action: 'create' },
			{
				onSuccess: (smpl: Sample) => {
					setShow(true);
					setNameInput(smpl.name);
					clearFilters();
					setSample({ ...smpl, filters: [] });
				},
			},
		);
	const copySample = () =>
		mutate(
			{ action: 'copy' },
			{
				onSuccess: (smpl: Sample) => {
					setShow(true);
					setNameInput(sample?.name ?? 'Copy');
					clearFilters();
					const authors = sample?.authors.includes(login!) ? sample.authors : [login!];
					const newSample = { ...sample!, name: smpl.name, id: smpl.id, authors, public: false };
					setSample(newSample);
					mutate({ action: 'update', ow: newSample }, {});
				},
			},
		);

	const unsavedChanges =
		show && sample && JSON.stringify(samples.find((s) => s.id === sample.id)) !== JSON.stringify(stripFilters);
	const allowEdit = sample && samples.find((s) => s.id === sample.id)?.authors.includes(login!);
	const nameValid =
		nameInput?.length && !samples.find((s) => sample?.id !== s.id && sample?.public === s.public && s.name === nameInput);

	const sampleStats = (() => {
		if (sample == null) return null;
		const { whitelist, blacklist } = sample;
		const applied = applySample(tableData, sample, columns, samples);
		const whitelisted = whitelist.filter((id) => tableData.find((row) => row[0] === id)).length;
		const blacklisted = blacklist.filter((id) => tableData.find((row) => row[0] === id)).length;
		return (
			<span className="min-w-max">
				<span title="Whitelisted events: found/total" className={whitelisted ? 'text-cyan' : 'text-dark'}>
					[+{whitelisted}
					{whitelist.length ? '/' + whitelist.length : ''}]
				</span>
				<span title="Blacklisted events: found/total" className={blacklisted ? 'text-magenta' : 'text-dark'}>
					{' '}
					[-{blacklisted}
					{blacklist.length ? '/' + blacklist.length : ''}]
				</span>
				<span title="Total members in sample" className="text-dark">
					{' '}
					= [{applied.length}]
				</span>
			</span>
		);
	})();

	const publicIssue =
		sample?.public &&
		sample.filters
			?.map(({ column }) => columns.find((col) => col.sql_name === column))
			.find((col) => col?.type === 'computed' && !col.is_public);

	return (
		<div ref={ref} className="max-w-[720px]">
			<div className="flex pb-0.5 gap-0.5 flex-wrap">
				{nameInput != null && (
					<Input
						className={cn(
							'grow-6 basis-7 min-w-0 p-0 border focus:ring-0 focus:border-active',
							!nameValid && 'border-red',
						)}
						onKeyDown={(e) => ['NumpadEnter', 'Enter'].includes(e.code) && (e.target as any)?.blur()}
						autoFocus
						onFocus={(e) => e.target.select()}
						onBlur={(e) => {
							if (nameValid) set({ name: nameInput });
							if (e.relatedTarget?.id !== 'rename') setNameInput(null);
						}}
						value={nameInput}
						onChange={(e) => setNameInput(e.target.value)}
					/>
				)}
				{nameInput == null && (
					<Select
						value={sample?.id?.toString() ?? '_none'}
						onValueChange={(val) =>
							val === '_create' ? createSample() : setSample(samples.find((s) => s.id.toString() === val) ?? null)
						}
					>
						<SelectTrigger
							title="Select events sample"
							className="border h-6.5 justify-center hover:border-active text-white grow-3 basis-40 min-w-0 focus:border-active focus:ring-0"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="_create">-- Create sample --</SelectItem>
							<SelectSeparator />
							<SelectItem value="_none">-- All events --</SelectItem>
							{samples.map(({ id, name, authors }) => (
								<SelectItem
									className={cn('py-0.5', !authors.includes(login!) && 'text-dark')}
									key={id}
									value={id.toString()}
								>
									{sample?.id === id ? sample!.name : name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
				{sample && (
					<Button
						variant="default"
						className="grow shrink basis-12"
						title="View sample parameters"
						onClick={() => {
							setShow(!show);
							if (!show) setSample(samples.find((s) => s.id === sample?.id) ?? null);
							setHoverAuthors(0);
						}}
					>
						{show ? (allowEdit ? 'Cancel' : 'Hide') : allowEdit ? 'Edit' : 'View'}
					</Button>
				)}
				{!sample && role && filters.length > 0 && (
					<Button variant="default" className="grow-3 shrink basis-12" onClick={() => createSample()}>
						Create sample
					</Button>
				)}
				<Button
					variant="default"
					className="grow-2 shrink basis-20"
					onClick={() => dispatchCustomEvent('action+addFilter')}
				>
					Add filter
				</Button>
			</div>

			{show && sample?.includes && (
				<div className="flex flex-wrap gap-[2px]">
					{sample.includes?.map((sid) => (
						<IncludeCard key={sid} sampleId={sid} disabled={!allowEdit} />
					))}
				</div>
			)}
			{show && sample?.filters && (
				<div className="flex flex-wrap gap-[2px]">
					{sample.filters.map((filter) => (
						<FilterCard key={filter.id} filter={filter} disabled={!allowEdit} />
					))}
				</div>
			)}
			{sample && show && !allowEdit && (
				<div className="flex flex-wrap p-1">
					{sampleStats}
					<span className="pl-1 text-dark">by {sample.authors.join(',')}</span>
					<div className="grow" />
					{login && (
						<Button className="TextButton" onClick={copySample}>
							Make a copy
						</Button>
					)}
				</div>
			)}
			{allowEdit && show && (
				<>
					<div className="flex flex-wrap p-1 gap-2 itemts-center">
						{sampleStats}
						{<IncludeCard sampleId={null} />}
						<div className="grow" />
						<Checkbox
							className={isPicking ? 'text-magenta' : ''}
							label="pick events"
							checked={isPicking}
							onCheckedChange={setPicking}
						/>
						<Checkbox label="public" checked={sample.public} onCheckedChange={(val) => set({ public: val })} />
						<Button className="pl-2" onClick={copySample}>
							Make a copy
						</Button>
					</div>
					{publicIssue && (
						<div
							title="Other users will not be able to use this sample, please make all required columns public"
							className="text-red"
						>
							! Public sample depends on a private column: {publicIssue.name}
						</div>
					)}
					<div
						title={`Created at: ${prettyDate(new Date(sample.created_at))}\nModified at: ${prettyDate(
							new Date(sample.modified_at),
						)}`}
						className="flex flex-wrap gap-1 py-1 px-[1px] justify-end"
					>
						<div
							className="w-max pt-0.5 pr-1"
							onMouseEnter={() => setHoverAuthors((a) => (a < 1 ? 1 : a))}
							onMouseLeave={() => setHoverAuthors((a) => (a > 1 ? a : 0))}
						>
							{hoverAuthors === 0 && <span className="text-dark">by {sample.authors.join(',')}</span>}
							{hoverAuthors === 1 && (
								<div className="cursor-pointer text-active" onClick={() => setHoverAuthors(2)}>
									Edit authors?
								</div>
							)}
						</div>
						{hoverAuthors === 2 && (
							<>
								<span>by </span>
								<TextInput
									className="grow-2 max-w-40 min-w-20"
									autoFocus
									onBlur={() => setHoverAuthors(0)}
									value={sample.authors.join(',')}
									onSubmit={(text) =>
										set({
											authors: text
												.trim()
												.split(/[,\s]+/g)
												.sort(),
										})
									}
								/>
							</>
						)}
						<Button
							id="rename"
							variant="default"
							className="grow basis-2 min-w-fit max-w-28"
							onClick={() => setNameInput(nameInput ? null : sample.name)}
						>
							Rename
						</Button>
						<Button variant="default" className="grow basis-2 min-w-fit max-w-28" onClick={deleteSample}>
							Delete
						</Button>
						{show && allowEdit && (
							<Button
								variant="default"
								disabled={!unsavedChanges}
								className={cn('grow basis-4 min-w-fit max-w-40', unsavedChanges && 'text-active')}
								onClick={() =>
									mutate(
										{ action: 'update' },
										{
											onSuccess: () => {
												setShow(false);
												logMessage('Sample edited: ' + sample.name);
												setHoverAuthors(0);
											},
										},
									)
								}
							>
								{isPending ? '...' : 'Save changes'}
							</Button>
						)}
					</div>
				</>
			)}
			{filters.length > 0 && (
				<div className="flex flex-wrap gap-[2px] py-[2px]">
					{filters.map((filter) => (
						<FilterCard key={filter.id} filter={filter} />
					))}
				</div>
			)}
		</div>
	);
});

SampleView.displayName = 'SampleView';
export default SampleView;
