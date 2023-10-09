import { forwardRef, useContext, useMemo, useState } from 'react';
import { AuthContext, logError, logMessage } from '../app';
import { apiPost, useConfirmation, useEventListener } from '../util';
import { ColumnDef, parseColumnValue, isValidColumnValue, MainTableContext, SampleContext } from './events';
import { Filter, useSampleState, Sample, applySample, FILTER_OPS } from './sample';
import { useMutation, useQueryClient } from 'react-query';

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
	const [filter, setFilter] = useState({ ...filterOri });
	const { changeFilter, removeFilter } = useSampleState();

	const { value, operation, column: columnId } = filter;
	const column = columns.find(c => c.id === columnId);

	const isSelectInput = column && column.type === 'enum' && operation !== 'regexp';
	const isInvalid = isFilterInvalid(filter, column);

	const set = (what: string) => (e: any) => {
		if (!column) return;
		const fl = { ...filter, [what]: e.target.value.trim() };
		if (column.enum && isSelectInput && !column.enum.includes(fl.value))
			fl.value = column.enum[0];
		setFilter(fl);
		if (!isFilterInvalid(fl, column))
			changeFilter(fl);
	};
	
	return (
		<div className='FilterCard' onKeyDown={e => e.code === 'Escape' && (e.target as HTMLElement).blur?.()}>
			<select disabled={disabled} style={{ flex: '4', textAlign: 'right', borderColor: column ? 'transparent' : 'var(--color-red)' }} 
				value={columnId} onChange={set('column')}>
				{columns.filter(col => !col.hidden).map(col =>
					<option value={col.id} key={col.table+col.name}>{col.fullName}</option>)}
				{!column && <option value={columnId} key={columnId}>{columnId}</option>}
			</select>
			<select disabled={disabled} style={{ flex: '2', textAlign: 'center', maxWidth: operation.includes('null') ? 'max-content' : '6.5ch',
				borderColor: column?.type === 'enum' && isInvalid ? 'var(--color-red)' : 'transparent', marginRight: '4px' }}
			value={operation} onChange={set('operation')}>
				{FILTER_OPS.map(op => <option key={op} value={op}>{op}</option>)}
			</select>
			{!operation.includes('null') && !isSelectInput &&
			<input type='text' disabled={disabled} style={{ textAlign: 'center', flex: '2', minWidth: 0, maxWidth: '8em',
				...(isInvalid && { borderColor: 'var(--color-red)' }) }} value={value} onChange={set('value')}/>}
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
		set, setSample, setPicking, setShow, clearFilters, addFilter } = useSampleState();
	const [hoverAuthors, setHoverAuthors] = useState(0);
	const [nameInput, setNameInput] = useState<string | null>(null);

	const { askConfirmation, confirmation } = useConfirmation('Sample deletion is irreversible. Proceed?',
		() => mutate('remove', { onSuccess: () => { setSample(null); logMessage('Sample deleted ' + sample); } }));
	
	const newName = (i: number=0): string => {
		const name = 'New Sample #' + i;
		return samples.find(s => s.name === name) ? newName(i + 1) : name; };
	const stripFilters = sample && { ...sample, filters: sample.filters?.map(({ column, operation, value }) => ({ column, operation, value })) ?? [] };
	const { mutate, isLoading } = useMutation(async (action: 'create' | 'remove' | 'update') =>
		apiPost<typeof action extends 'remove' ? { message?: string } : Sample>(`events/samples/${action}`, (() => {
			switch (action) {
				case 'create': return {
					name: newName(),
					filters: filters.map(({ column, operation, value }) => ({ column, operation, value })) };
				case 'remove': return { id: sample?.id };
				case 'update': return stripFilters ?? {};
			}
		})()), { onSuccess: () => queryClient.refetchQueries(['samples']), onError: logError });

	useEventListener('escape', () => setNameInput(null));

	const createSample = () => mutate('create', { onSuccess: (smpl: Sample) => {
		setShow(true); setNameInput(smpl.name); clearFilters();
		setSample({ ...smpl, filters: smpl.filters?.map((f, i) => ({ ...f, id: Date.now() + i })) ?? null });
	 } });

	const unsavedChanges = show && sample && JSON.stringify(samples.find(s => s.id === sample.id)) !== JSON.stringify(stripFilters);
	const allowEdit = sample && samples.find(s => s.id === sample.id)?.authors.includes(login!);
	const nameValid = nameInput?.length && !samples.find(s => sample?.id !== s.id && s.name === nameInput);

	const sampleStats = useMemo(() => {
		if (sample == null) return null;
		const { whitelist, blacklist } = sample;
		const applied = applySample(tableData, sample, columns);
		const whitelisted = whitelist.filter(id => tableData.find(row => row[0] === id)).length;
		const blacklisted = blacklist.filter(id => tableData.find(row => row[0] === id)).length;
		return <span style={{ minWidth: 'max-content' }}>
			<span title='Whitelisted events: found/total' style={{ color: whitelisted ? 'var(--color-cyan)' : 'var(--color-text-dark)' }}
			>[+{whitelisted}{whitelist.length ? '/' + whitelist.length : ''}]</span>
			<span title='Blacklisted events: found/total' style={{ color: blacklisted ? 'var(--color-magenta)' : 'var(--color-text-dark)' }}
			> [-{blacklisted}{blacklist.length ? '/' + blacklist.length : ''}]</span>
			<span title='Total members in sample' style={{ color: 'var(--color-text-dark)' }}> = [{applied.length}]</span>
		</span>;

	}, [columns, sample, tableData]);

	return (<div ref={ref}>
		{confirmation}
		<div style={{ display: 'flex', paddingBottom: 2, gap: 2, flexWrap: 'wrap' }}>
			{nameInput != null && <input type='text' style={{ flex: '6 8em', padding: 0, minWidth: 0,
				...(!nameValid && { borderColor: 'var(--color-red)' }) }} onKeyDown={e => ['NumpadEnter', 'Enter'].includes(e.code) && (e.target as any)?.blur()}
			placeholder='Sample name' autoFocus onFocus={e => e.target.select()} onBlur={(e) => {
				if (nameValid) set({ name: nameInput });
				if (e.relatedTarget?.id !== 'rename') setNameInput(null); }}
			value={nameInput} onChange={e => setNameInput(e.target.value)}/>}
			{nameInput == null && <select title='Select events sample' style={{ color: 'var(--color-white)', flex: '6 8em', minWidth: 0 }} value={sample?.id ?? '_none'}
				onChange={e => e.target.value === '_create' ? createSample() : setSample(samples.find(s => s.id.toString() === e.target.value) ?? null)}>
				<option value='_create'>-- Create sample --</option>
				<option value='_none'>-- All events --</option>
				{samples.map(({ id, name }) => <option key={id} value={id}>{sample?.id === id ? sample.name : name}</option>)}
			</select>}
			{sample && <button style={{ flex: '1 fit-content' }} title='View sample parameters'
				onClick={() => {setShow(!show); if (!show) setSample(samples.find(s => s.id === sample?.id) ?? null); setHoverAuthors(0);}}
			>{show ? allowEdit ? 'Cancel' : 'Hide' : allowEdit ? 'Edit' : 'View'}</button>}
			{!sample && role && filters.length > 0 && <button style={{ flex: '1 fit-content' }} onClick={createSample}>Create sample</button>}
			<button style={{ flex: '1 fit-content' }} onClick={() => addFilter()}>Add filter</button>
		</div>
		
		{show && sample?.filters && <div className='Filters'>
			{sample.filters.map((filter) => <FilterCard key={filter.id} filter={filter} disabled={!allowEdit}/>)}
		</div>}
		{sample && show && !allowEdit && <div style={{ padding: 4 }}>
			{sampleStats}
			<span style={{ marginLeft: '1em', color: 'var(--color-text-dark)' }}>by {sample.authors.join(',')}</span>				
		</div>}
		{allowEdit && show && <><div style={{ padding: 4, display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'right' }}>
			{sampleStats}
			<div style={{ flex: 1 }}/>
			<label className='MenuInput' style={{ minWidth: 'max-content', ...(isPicking && { color: 'var(--color-magenta)' }) }}>
				pick events<input checked={isPicking} onChange={(e) => setPicking(e.target.checked)} type='checkbox'/></label>
			<label className='MenuInput' style={{ minWidth: 'max-content' }}>
				public<input checked={sample.public} onChange={(e) => set({ public: e.target.checked })} type='checkbox'/></label>
		</div>
		<div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 1px', justifyContent: 'right' }}>
			<div style={{ width: 'max-content', paddingTop: 2, paddingRight: 4 }} onMouseEnter={() => setHoverAuthors(a => a < 1 ? 1 : a)}
				onMouseLeave={()=>setHoverAuthors(a => a > 1 ? a : 0)}>
				{hoverAuthors === 0 && <span style={{ color: 'var(--color-text-dark)' }}>by {sample.authors.join(',')}</span>}
				{hoverAuthors === 1 && <div style={{ cursor: 'pointer', color: 'var(--color-active)' }}
					onClick={()=>setHoverAuthors(2)}>Edit authors?</div>}
			</div>
			{hoverAuthors === 2 && <><span>by </span><input autoFocus onBlur={() => setHoverAuthors(0)}
				defaultValue={sample.authors.join(',')} style={{ flex: 2, maxWidth: '12em', minWidth: '6em' }}
				onChange={e => set({ authors: e.target.value.trim().split(/[,\s]+/g).sort() })}/></>}
			<button id='rename' style={{ flex: '1 4em', minWidth: 'fit-content', maxWidth: '7em' }}
				onClick={() => setNameInput(nameInput ? null : sample.name)}>Rename</button>
			<button style={{ flex: '1 4em', minWidth: 'fit-content', maxWidth: '7em' }} onClick={askConfirmation}>Delete</button>
			{show && allowEdit && <button disabled={!unsavedChanges} style={{ flex: '2 4em', minWidth: 'fit-content',
				maxWidth: '12em', ...(unsavedChanges && { color: 'var(--color-active)' }) }}
			onClick={() => mutate('update', { onSuccess: () =>{ setShow(false);
				logMessage('Sample edited: '+sample.name); setHoverAuthors(0); } })}>{isLoading ? '...' : 'Save changes'}</button>}
		</div></>}
		{filters.length > 0 && <div className='Filters' style={{ padding: '2px 0 2px 0' }}>
			{filters.map(filter => <FilterCard key={filter.id} filter={filter}/>)}
		</div>}
	</div>);
});

SampleView.displayName = 'SampleView';
export default SampleView;