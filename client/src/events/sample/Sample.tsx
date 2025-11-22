import { forwardRef, useContext, useRef, useState } from 'react';
import { AuthContext, color, logError, logMessage } from '../../app';
import { apiPost, cn, dispatchCustomEvent, prettyDate, useEventListener } from '../../util';
import { parseColumnValue, isValidColumnValue, useEventsSettings } from '../core/util';
import { useSampleState, applySample, type FilterWithId } from './sample';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { withConfirmation } from '../../components/Confirmation';
import { filterOperations, type Column, type Filter, type Sample } from '../../api';
import { useTable } from '../core/editableTables';
import { useFeidSample } from '../core/feid';
import { Select, SelectContent, SelectSeparator, SelectTrigger, SelectValue, SelectItem } from '../../components/Select';
import { Button } from '../../components/Button';

function isFilterInvalid({ operation, value }: Filter, column?: Column) {
	if (!column) return true;
	if (['is null', 'not null'].includes(operation)) return false;
	if ('regexp' === operation) {
		try {
			new RegExp(value);
		} catch (e) {
			return true;
		}
		return false;
	}
	if (['<=', '>='].includes(operation) && column.dtype === 'enum') return true;
	const val = parseColumnValue(value, column);
	return !isValidColumnValue(val, column);
}

function IncludeCard({ sampleId: id, disabled }: { sampleId: number | null; disabled?: boolean }) {
	const { samples } = useFeidSample();
	const { changeInclude, removeInclude, current } = useSampleState();

	if (!samples) return null;

	const blank = id === null;
	const opts = samples.filter((s) => s.id !== current?.id && (s.id === id || !current?.includes?.includes(s.id)));
	const sample = samples.find((s) => s.id === id);

	return (
		<div>
			{!blank && <span style={{ fontSize: 14, color: color('dark'), paddingLeft: 8 }}>include</span>}
			{!blank && !sample && <span style={{ fontSize: 14, color: color('red'), padding: 6 }}>DELETED</span>}
			{(blank || sample) && (
				<select
					style={{
						color: color(blank && !current?.includes?.length ? 'dark' : 'text'),
						borderColor: 'transparent',
						width: sample ? sample.name.length + 4 + 'ch' : 'auto',
					}}
					value={id ?? '__none'}
					onChange={(e) => changeInclude(id, parseInt(e.target.value))}
				>
					{blank && (
						<option disabled value="__none" style={{ lineHeight: 2 }}>
							include sample
						</option>
					)}
					{opts.map(({ id: s, name }) => (
						<option key={s} value={s}>
							{name}
						</option>
					))}
				</select>
			)}
			{id && !disabled && <div className="CloseButton" onClick={() => removeInclude(id)} />}
		</div>
	);
}

function FilterCard({ filter: filterOri, disabled }: { filter: FilterWithId; disabled?: boolean }) {
	const { columns } = useTable('feid');
	const { shownColumns } = useEventsSettings();
	const [filter, setFilter] = useState({ ...filterOri });
	const { changeFilter, removeFilter } = useSampleState();

	const { value, operation, column: columnId } = filter;
	const column = columns.find((col) => col.sql_name === columnId);

	const isSelectInput = column && column.dtype === 'enum' && operation !== 'regexp';
	const isInvalid = isFilterInvalid(filter, column);

	const set = (what: string) => (e: any) => {
		if (!column && what !== 'column') return;
		const fl = { ...filter, [what]: e.target.value.trim() };
		if (isSelectInput && column.type === 'static' && column.enum && !column.enum.includes(fl.value))
			fl.value = column.enum[0];
		setFilter(fl);
		if (!isFilterInvalid(fl, column)) changeFilter(fl);
		if (e.target instanceof HTMLSelectElement) e.target.blur();
	};

	return (
		<div className="FilterCard" onKeyDown={(e) => e.code === 'Escape' && (e.target as HTMLElement).blur?.()}>
			<select
				disabled={disabled}
				style={{ width: 400, flex: '4', textAlign: 'right', borderColor: column ? 'transparent' : color('red') }}
				value={columnId}
				onChange={set('column')}
			>
				{shownColumns
					?.map((show) => columns.find((col) => col.sql_name === show))
					.filter((col): col is Column => !!col)
					.map((col) => (
						<option value={col.sql_name} key={col.sql_name}>
							{col.name}
						</option>
					))}
				{column && !shownColumns?.includes(columnId) && (
					<option value={columnId} key={columnId}>
						{column.name}
					</option>
				)}
				{!column && (
					<option value={columnId} key={columnId}>
						{columnId}
					</option>
				)}
			</select>
			<select
				disabled={disabled}
				style={{
					flex: '2',
					textAlign: 'center',
					maxWidth: operation.includes('null') ? 'max-content' : '6.5ch',
					borderColor: column?.dtype === 'enum' && isInvalid ? color('red') : 'transparent',
					marginRight: '4px',
				}}
				value={operation}
				onChange={set('operation')}
			>
				{filterOperations.map((op) => (
					<option key={op} value={op}>
						{op}
					</option>
				))}
			</select>
			{!operation.includes('null') && !isSelectInput && (
				<input
					type="text"
					disabled={disabled}
					style={{
						textAlign: 'center',
						flex: '2',
						minWidth: 0,
						maxWidth: '8em',
						...(isInvalid && { borderColor: color('red') }),
					}}
					value={value}
					onChange={set('value')}
				/>
			)}
			{!operation.includes('null') && isSelectInput && column.type === 'static' && (
				<select
					disabled={disabled}
					style={{ flex: '2', maxWidth: '8em', minWidth: 0 }}
					value={value}
					onChange={set('value')}
				>
					{column.enum?.map((val) => (
						<option key={val} value={val}>
							{val}
						</option>
					))}
				</select>
			)}
			{!disabled && <div className="CloseButton" onClick={() => removeFilter(filter.id)} />}
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
							return ow ? ow : stripFilters ?? {};
					}
				})()
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
				}
			)
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
			}
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
			}
		);

	const unsavedChanges =
		show && sample && JSON.stringify(samples.find((s) => s.id === sample.id)) !== JSON.stringify(stripFilters);
	const allowEdit = sample && samples.find((s) => s.id === sample.id)?.authors.includes(login!);
	const nameValid =
		nameInput?.length && !samples.find((s) => sample?.id !== s.id && sample?.public === s.public && s.name === nameInput);

	// FIXME: this was a memo, is optimization rly needed here?
	const sampleStats = (() => {
		if (sample == null) return null;
		const { whitelist, blacklist } = sample;
		const applied = applySample(tableData, sample, columns, samples);
		const whitelisted = whitelist.filter((id) => tableData.find((row) => row[0] === id)).length;
		const blacklisted = blacklist.filter((id) => tableData.find((row) => row[0] === id)).length;
		return (
			<span style={{ minWidth: 'max-content' }}>
				<span title="Whitelisted events: found/total" style={{ color: whitelisted ? color('cyan') : color('dark') }}>
					[+{whitelisted}
					{whitelist.length ? '/' + whitelist.length : ''}]
				</span>
				<span title="Blacklisted events: found/total" style={{ color: blacklisted ? color('magenta') : color('dark') }}>
					{' '}
					[-{blacklisted}
					{blacklist.length ? '/' + blacklist.length : ''}]
				</span>
				<span title="Total members in sample" style={{ color: color('dark') }}>
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
		<div ref={ref} style={{ maxWidth: '46em' }}>
			<div style={{ display: 'flex', paddingBottom: 2, gap: 2, flexWrap: 'wrap' }}>
				{nameInput != null && (
					<input
						type="text"
						style={{ flex: '6 8em', padding: 0, minWidth: 0, ...(!nameValid && { borderColor: color('red') }) }}
						onKeyDown={(e) => ['NumpadEnter', 'Enter'].includes(e.code) && (e.target as any)?.blur()}
						placeholder="Sample name"
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

			{show && sample?.filters && (
				<div className="Filters">
					{sample.includes?.map((sid) => (
						<IncludeCard key={sid} sampleId={sid} disabled={!allowEdit} />
					))}
				</div>
			)}
			{show && sample?.filters && (
				<div className="Filters">
					{sample.filters.map((filter) => (
						<FilterCard key={filter.id} filter={filter} disabled={!allowEdit} />
					))}
				</div>
			)}
			{sample && show && !allowEdit && (
				<div style={{ padding: 4, display: 'flex', flexWrap: 'wrap' }}>
					{sampleStats}
					<span style={{ marginLeft: '1em', color: color('dark') }}>by {sample.authors.join(',')}</span>
					<div style={{ flex: 1 }} />
					{login && (
						<Button className="TextButton" style={{ paddingRight: 4 }} onClick={copySample}>
							Make copy
						</Button>
					)}
				</div>
			)}
			{allowEdit && show && (
				<>
					<div
						style={{
							padding: 4,
							display: 'flex',
							flexWrap: 'wrap',
							gap: 8,
							justifyContent: 'right',
							alignItems: 'center',
						}}
					>
						{sampleStats}
						{<IncludeCard sampleId={null} />}
						<div style={{ flex: 1 }} />
						<label
							className="MenuInput"
							style={{ minWidth: 'max-content', ...(isPicking && { color: color('magenta') }) }}
						>
							pick events
							<input checked={isPicking} onChange={(e) => setPicking(e.target.checked)} type="checkbox" />
						</label>
						<label className="MenuInput" style={{ minWidth: 'max-content' }}>
							public
							<input
								checked={sample.public}
								onChange={(e) => set({ public: e.target.checked })}
								type="checkbox"
							/>
						</label>
						<Button className="TextButton" style={{ paddingLeft: 8 }} onClick={copySample}>
							Make copy
						</Button>
					</div>
					{publicIssue && (
						<div
							title="Other users will not be able to use this sample, please make all required columns public"
							style={{ color: color('red') }}
						>
							! Public sample depends on a private column: {publicIssue.name}
						</div>
					)}
					<div
						title={`Created at: ${prettyDate(new Date(sample.created))}\nModified at: ${prettyDate(
							new Date(sample.modified)
						)}`}
						style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 1px', justifyContent: 'right' }}
					>
						<div
							style={{ width: 'max-content', paddingTop: 2, paddingRight: 4 }}
							onMouseEnter={() => setHoverAuthors((a) => (a < 1 ? 1 : a))}
							onMouseLeave={() => setHoverAuthors((a) => (a > 1 ? a : 0))}
						>
							{hoverAuthors === 0 && <span style={{ color: color('dark') }}>by {sample.authors.join(',')}</span>}
							{hoverAuthors === 1 && (
								<div style={{ cursor: 'pointer', color: color('active') }} onClick={() => setHoverAuthors(2)}>
									Edit authors?
								</div>
							)}
						</div>
						{hoverAuthors === 2 && (
							<>
								<span>by </span>
								<input
									autoFocus
									onBlur={() => setHoverAuthors(0)}
									defaultValue={sample.authors.join(',')}
									style={{ flex: 2, maxWidth: '12em', minWidth: '6em' }}
									onChange={(e) =>
										set({
											authors: e.target.value
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
							style={{ flex: '1 4em', minWidth: 'fit-content', maxWidth: '7em' }}
							onClick={() => setNameInput(nameInput ? null : sample.name)}
						>
							Rename
						</Button>
						<Button style={{ flex: '1 4em', minWidth: 'fit-content', maxWidth: '7em' }} onClick={deleteSample}>
							Delete
						</Button>
						{show && allowEdit && (
							<Button
								disabled={!unsavedChanges}
								style={{
									flex: '2 4em',
									minWidth: 'fit-content',
									maxWidth: '12em',
									...(unsavedChanges && { color: color('active') }),
								}}
								onClick={() =>
									mutate(
										{ action: 'update' },
										{
											onSuccess: () => {
												setShow(false);
												logMessage('Sample edited: ' + sample.name);
												setHoverAuthors(0);
											},
										}
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
				<div className="Filters" style={{ padding: '2px 0 2px 0' }}>
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
