import { forwardRef, useContext, useMemo, useRef, useState } from 'react';
import { AuthContext, color, logError, logMessage } from '../app';
import { apiPost, dispatchCustomEvent, prettyDate, useEventListener } from '../util';
import { type ColumnDef, parseColumnValue, isValidColumnValue, MainTableContext, SampleContext, useEventsSettings } from './events';
import { type Filter, type Sample, useSampleState, applySample, FILTER_OPS } from './sample';
import { useMutation, useQueryClient } from 'react-query';
import { Option, Select, useConfirmation } from '../Utility';

function isFilterInvalid({ operation, value }: Filter, column?: ColumnDef) {
	if (!column)
		return true;
	if (['is null', 'not null'].includes(operation))
		return false;
	if ('regexp' === operation) {
		try { new RegExp(value); } catch(e) { return true; }
		return false;
	}
	if (['<=', '>='].includes(operation) && column.type === 'enum')
		return true;
	const val = parseColumnValue(value, column);
	return !isValidColumnValue(val, column);
}

function FilterCard({ filter: filterOri, disabled }: { filter: Filter, disabled?: boolean }) {
	const { columns } = useContext(MainTableContext);
	const { shownColumns } = useEventsSettings();
	const [filter, setFilter] = useState({ ...filterOri });
	const { changeFilter, removeFilter } = useSampleState();

	const { value, operation, column: columnId } = filter;
	const column = columns.find(c => c.id === columnId);

	const isSelectInput = column && column.type === 'enum' && operation !== 'regexp';
	const isInvalid = isFilterInvalid(filter, column);

	const set = (what: string) => (e: any) => {
		if (!column && what !== 'column') return;
		const fl = { ...filter, [what]: e.target.value.trim() };
		if (column?.enum && isSelectInput && !column.enum.includes(fl.value))
			fl.value = column.enum[0];
		setFilter(fl);
		if (!isFilterInvalid(fl, column))
			changeFilter(fl);
		if (e.target instanceof HTMLSelectElement)
			e.target.blur();
	};
	
	return (
		<div className='FilterCard' onKeyDown={e => e.code === 'Escape' && (e.target as HTMLElement).blur?.()}>
			<select disabled={disabled} style={{ width: 400, flex: '4', textAlign: 'right', borderColor: column ? 'transparent' : color('red') }} 
				value={columnId} onChange={set('column')}>
				{shownColumns?.map(c => columns.find(col => col.id === c)).filter(c => c).map(col =>
					<option value={col!.id} key={col!.id}>{col!.fullName}</option>)}
				{column && !shownColumns?.includes(columnId) &&
					<option value={columnId} key={columnId}>{column.fullName}</option>}
				{!column && <option value={columnId} key={columnId}>{columnId}</option>}
			</select>
			<select disabled={disabled} style={{ flex: '2', textAlign: 'center', maxWidth: operation.includes('null') ? 'max-content' : '6.5ch',
				borderColor: column?.type === 'enum' && isInvalid ? color('red') : 'transparent', marginRight: '4px' }}
			value={operation} onChange={set('operation')}>
				{FILTER_OPS.map(op => <option key={op} value={op}>{op}</option>)}
			</select>
			{!operation.includes('null') && !isSelectInput &&
			<input type='text' disabled={disabled} style={{ textAlign: 'center', flex: '2', minWidth: 0, maxWidth: '8em',
				...(isInvalid && { borderColor: color('red') }) }} value={value} onChange={set('value')}/>}
			{!operation.includes('null') && isSelectInput &&
			<select disabled={disabled} style={{ flex: '2', maxWidth: '8em', minWidth: 0 }} value={value} onChange={set('value')}>
				{column.enum?.map(val => <option key={val} value={val}>{val}</option>)}
			</select>}
			{!disabled && <div className='CloseButton' onClick={() => removeFilter(filter.id)}/>}
		</div>
	);
}

const SampleView = forwardRef<HTMLDivElement>((props, ref) => {
	const queryClient = useQueryClient();
	const { data: tableData, columns } = useContext(MainTableContext);
	const { samples } = useContext(SampleContext);
	const { login, role } = useContext(AuthContext);
	const { current: sample, filters, isPicking, showDetails: show,
		set, setSample, setPicking, setShow, clearFilters } = useSampleState();
	const [hoverAuthors, setHoverAuthors] = useState(0);
	const [nameInput, setNameInput] = useState<string | null>(null);
	const toDelete = useRef<Sample>();

	const { askConfirmation, confirmation } = useConfirmation('Sample deletion is irreversible. Proceed?',
		() => mutate({ action: 'remove', ow: toDelete.current ?? sample! }, { onSuccess: () => {
			logMessage('Sample deleted: ' + (toDelete.current ?? sample)?.name );
			toDelete.current = undefined;
			setSample(null);
		} }));
	
	const newName = (i: number=0, n?: string): string => {
		const name = (n ? n + ' Copy #' : 'New Sample #') + i;
		return samples.find(s => s.name === name) ? newName(i + 1, n) : name; };
	const stripFilters = sample && { ...sample, filters: sample.filters?.map(({ column, operation, value }) => ({ column, operation, value })) ?? [] };
	const { mutate, isLoading } = useMutation(async ({ action, ow }: { action: 'create' | 'remove' | 'update' | 'copy', ow?: Sample }) =>
		apiPost<typeof action extends 'remove' ? { message?: string } : Sample>(
			`events/samples/${action === 'copy' ? 'create' : action}`, (() => {
				switch (action) {
					case 'copy': return {
						name: newName(0, sample!.name),
						filters: [] };
					case 'create': return {
						name: newName(),
						filters: filters.map(({ column, operation, value }) => ({ column, operation, value })) };
					case 'remove': return { id: ow?.id ?? sample?.id };
					case 'update': return ow ? ow : stripFilters ?? {};
				}
			})()), { onSuccess: () => queryClient.refetchQueries(['samples']), onError: logError });

	useEventListener('escape', () => setNameInput(null));

	const createSample = () => mutate({ action: 'create' }, { onSuccess: (smpl: Sample) => {
		setShow(true); setNameInput(smpl.name); clearFilters();
		setSample({ ...smpl, filters: smpl.filters?.map((f, i) => ({ ...f, id: Date.now() + i })) ?? null });
	 } });
	const copySample = () => mutate({ action: 'copy' }, { onSuccess: (smpl: Sample) => {
		setShow(true);
		setNameInput(sample?.name ?? 'Copy');
		clearFilters();
		const authors = sample?.authors.includes(login!) ? sample.authors : [login!];
		const newSample = { ...sample!, name: smpl.name, id: smpl.id, authors, public: false };
		setSample(newSample);
		mutate({ action: 'update', ow: newSample }, {});
	 } });

	const unsavedChanges = show && sample && JSON.stringify(samples.find(s => s.id === sample.id)) !== JSON.stringify(stripFilters);
	const allowEdit = sample && samples.find(s => s.id === sample.id)?.authors.includes(login!);
	const nameValid = nameInput?.length && !samples.find(s => sample?.id !== s.id && sample?.public === s.public && s.name === nameInput);

	const sampleStats = useMemo(() => {
		if (sample == null) return null;
		const { whitelist, blacklist } = sample;
		const applied = applySample(tableData, sample, columns);
		const whitelisted = whitelist.filter(id => tableData.find(row => row[0] === id)).length;
		const blacklisted = blacklist.filter(id => tableData.find(row => row[0] === id)).length;
		return <span style={{ minWidth: 'max-content' }}>
			<span title='Whitelisted events: found/total' style={{ color: whitelisted ? color('cyan') : color('text-dark') }}
			>[+{whitelisted}{whitelist.length ? '/' + whitelist.length : ''}]</span>
			<span title='Blacklisted events: found/total' style={{ color: blacklisted ? color('magenta') : color('text-dark') }}
			> [-{blacklisted}{blacklist.length ? '/' + blacklist.length : ''}]</span>
			<span title='Total members in sample' style={{ color: color('text-dark') }}> = [{applied.length}]</span>
		</span>;

	}, [columns, sample, tableData]);

	const publicIssue = sample?.public && sample.filters?.map(({ column }) => columns.find(c => c.id === column))
		.find(col => col?.generic && !col.generic.is_public);

	return (<div ref={ref} style={{ maxWidth: '46em' }}>
		{confirmation}
		<div style={{ display: 'flex', paddingBottom: 2, gap: 2, flexWrap: 'wrap' }}>
			{nameInput != null && <input type='text' style={{ flex: '6 8em', padding: 0, minWidth: 0,
				...(!nameValid && { borderColor: color('red') }) }} onKeyDown={e => ['NumpadEnter', 'Enter'].includes(e.code) && (e.target as any)?.blur()}
			placeholder='Sample name' autoFocus onFocus={e => e.target.select()} onBlur={(e) => {
				if (nameValid) set({ name: nameInput });
				if (e.relatedTarget?.id !== 'rename') setNameInput(null); }}
			value={nameInput} onChange={e => setNameInput(e.target.value)}/>}
			{nameInput == null && <Select title='Select events sample'
				style={{ color: color('white'), flex: '6 8em', minWidth: 0 }}
				value={sample?.id?.toString() ?? '_none'}
				content={sample?.name ?? '-- All events --'}
				onChange={val => val === '_create' ? createSample() : setSample(samples.find(s => s.id.toString() === val) ?? null)}>
				<Option value='_create'>-- Create sample --</Option>
				<Option value='_none'>-- All events --</Option>
				{samples.map(({ id, name, authors }) =>
					<Option key={id} value={id.toString()} style={{ display: 'flex', color: color(authors.includes(login!) ? 'text' : 'text-dark') }}>
						{sample?.id === id ? sample.name : name}
						<div style={{ flex: 1 }}/>
						{authors.includes(login!) && <div className='CloseButton' onClick={e => {
							e.stopPropagation();
							toDelete.current = samples.find(s => s.id === id)!;
							askConfirmation(e);
						}}/>}
					</Option>)}
			</Select>}
			{sample && <button style={{ flex: '1 fit-content' }} title='View sample parameters'
				onClick={() => {setShow(!show); if (!show) setSample(samples.find(s => s.id === sample?.id) ?? null); setHoverAuthors(0);}}
			>{show ? allowEdit ? 'Cancel' : 'Hide' : allowEdit ? 'Edit' : 'View'}</button>}
			{!sample && role && filters.length > 0 && <button style={{ flex: '1 fit-content' }} onClick={createSample}>Create sample</button>}
			<button style={{ flex: '1 fit-content' }} onClick={() => dispatchCustomEvent('action+addFilter')}>Add filter</button>
		</div>
		
		{show && sample?.filters && <div className='Filters'>
			{sample.filters.map((filter) => <FilterCard key={filter.id} filter={filter} disabled={!allowEdit}/>)}
		</div>}
		{sample && show && !allowEdit && <div style={{ padding: 4, display: 'flex', flexWrap: 'wrap' }}>
			{sampleStats}
			<span style={{ marginLeft: '1em', color: color('text-dark') }}>by {sample.authors.join(',')}</span>
			<div style={{ flex: 1 }}/>
			{login && <button className='TextButton' style={{ paddingRight: 4 }} onClick={copySample}>Make copy</button>}
		</div>}
		{allowEdit && show && <><div style={{ padding: 4, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'right' }}>
			{sampleStats}
			<div style={{ flex: 1 }}/>
			<label className='MenuInput' style={{ minWidth: 'max-content', ...(isPicking && { color: color('magenta') }) }}>
				pick events<input checked={isPicking} onChange={(e) => setPicking(e.target.checked)} type='checkbox'/></label>
			<label className='MenuInput' style={{ minWidth: 'max-content' }}>
				public<input checked={sample.public} onChange={(e) => set({ public: e.target.checked })} type='checkbox'/></label>
			<button className='TextButton' style={{ paddingLeft: 8 }} onClick={copySample}>Make copy</button>
		</div>
		{publicIssue && <div title='Other users will not be able to use this sample, please make all required columns public'
			style={{ color: color('red') }}>! Public sample depends on a private column: {publicIssue.fullName}</div>}
		<div title={`Created at: ${prettyDate(sample.created)}\nModified at: ${prettyDate(sample.modified)}`}
			style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 1px', justifyContent: 'right' }}>
			<div style={{ width: 'max-content', paddingTop: 2, paddingRight: 4 }} onMouseEnter={() => setHoverAuthors(a => a < 1 ? 1 : a)}
				onMouseLeave={()=>setHoverAuthors(a => a > 1 ? a : 0)}>
				{hoverAuthors === 0 && <span style={{ color: color('text-dark') }}>by {sample.authors.join(',')}</span>}
				{hoverAuthors === 1 && <div style={{ cursor: 'pointer', color: color('active') }}
					onClick={()=>setHoverAuthors(2)}>Edit authors?</div>}
			</div>
			{hoverAuthors === 2 && <><span>by </span><input autoFocus onBlur={() => setHoverAuthors(0)}
				defaultValue={sample.authors.join(',')} style={{ flex: 2, maxWidth: '12em', minWidth: '6em' }}
				onChange={e => set({ authors: e.target.value.trim().split(/[,\s]+/g).sort() })}/></>}
			<button id='rename' style={{ flex: '1 4em', minWidth: 'fit-content', maxWidth: '7em' }}
				onClick={() => setNameInput(nameInput ? null : sample.name)}>Rename</button>
			<button style={{ flex: '1 4em', minWidth: 'fit-content', maxWidth: '7em' }} onClick={askConfirmation}>Delete</button>
			{show && allowEdit && <button disabled={!unsavedChanges} style={{ flex: '2 4em', minWidth: 'fit-content',
				maxWidth: '12em', ...(unsavedChanges && { color: color('active') }) }}
			onClick={() => mutate({ action: 'update' }, { onSuccess: () =>{ setShow(false);
				logMessage('Sample edited: '+sample.name); setHoverAuthors(0); } })}>{isLoading ? '...' : 'Save changes'}</button>}
		</div></>}
		{filters.length > 0 && <div className='Filters' style={{ padding: '2px 0 2px 0' }}>
			{filters.map(filter => <FilterCard key={filter.id} filter={filter}/>)}
		</div>}
	</div>);
});

SampleView.displayName = 'SampleView';
export default SampleView;