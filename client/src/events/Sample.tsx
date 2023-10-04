import { useContext, useState } from 'react';
import { AuthContext } from '../app';
import { apiPost, useConfirmation } from '../util';
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

export function SampleView() {
	const queryClient = useQueryClient();
	const { data: tableData, columns } = useContext(MainTableContext);
	const { samples } = useContext(SampleContext);
	const { login, role } = useContext(AuthContext);
	const { current: sample, filters, isPicking, set, setSample, setPicking, setShow, addFilter } = useSampleState();
	const [hoverAuthors, setHoverAuthors] = useState(0);

	const { askConfirmation, confirmation } = useConfirmation('Sample deletion is irreversible. Proceed?',
		() => () => mutate('remove', { onSuccess: () => setSample(null) }));
	
	const stripFilters = sample && { ...sample, filters: sample.filters?.map(({ column, operation, value }) => ({ column, operation, value })) ?? [] };
	const { mutate } = useMutation(async (action: 'create' | 'remove' | 'update') => 
		apiPost<typeof action extends 'remove' ? { message?: string } : Sample>(`events/samples/${action}`, (() => {
			switch (action) {
				// case 'create': return { name: nameInput };
				case 'remove': return { id: sample?.id };
				case 'update': return stripFilters ?? {};
			}
		})()), { onSuccess: () => queryClient.invalidateQueries(['sample']) });

	// useEventListener('sampleEdit', (e) => {
	// 	if (!sample || !isEditing) return;
	// 	const { action, id } = e.detail as { action: 'whitelist' | 'blacklist', id: number };
	// 	const target = sample[action];
	// 	const found = target.indexOf(id);
	// 	const opposite = action === 'blacklist' ? 'whitelist' : 'blacklist';
	// 	setSample(smpl => ({ ...smpl!,
	// 		[action]: found < 0 ? target.concat(id) : target.filter(i => i !== id),
	// 		[opposite]: sample[opposite].filter(i => i !== id)
	// 	}));
	// });

	const unsavedChanges = sample && JSON.stringify(samples.find(s => s.id === sample.id)) !== JSON.stringify(stripFilters);
	const allowEdit = sample && samples.find(s => s.id === sample.id)?.authors.includes(login!);

	const applied = sample && applySample(tableData, sample, columns);
	const whitelisted = sample && sample.whitelist.filter(id => tableData.find(row => row[0] === id)).length;
	const blacklisted = sample && sample.blacklist.filter(id => tableData.find(row => row[0] === id)).length;
	const sampleStats = sample && (<span style={{ marginRight: '8px' }}>
		<span style={{ color: whitelisted ? 'var(--color-cyan)' : 'var(--color-text-dark)' }}
		>[+{whitelisted}{sample.whitelist.length ? '/' + sample.whitelist.length : ''}]</span>
		<span style={{ color: blacklisted ? 'var(--color-magenta)' : 'var(--color-text-dark)' }}
		> [-{blacklisted}{sample.blacklist.length ? '/' + sample.blacklist.length : ''}]</span>
		<span style={{ color: 'var(--color-text-dark)' }}> = [{applied!.length}]</span>
	</span>);
	return (
		<div style={{ }}>
			{confirmation}
			<div style={{ display: 'flex', paddingBottom: 2, gap: 4, flexWrap: 'wrap' }}>
				<select title='Events sample' style={{ flex: '3', flexBasis: 'max-content' }} value={sample?.name ?? 'none'}
					onChange={e => setSample(samples.find(s => s.name === e.target.value) ?? null)}>
					<option value='none'>all events</option>
					{samples.map(({ name }) => <option key={name} value={name}>{name}</option>)}
				</select>
				<button style={{ flex: '1 fit-content' }} onClick={() => addFilter()}>Add filter</button>
				<button>{allowEdit ? 'Modify' : 'Show'}</button>
				{!sample && role && <button style={{  }} onClick={() => mutate('create', {
					onSuccess: (smpl: Sample) => setSample({ ...smpl, filters: smpl.filters?.map((f, i) => ({ ...f, id: Date.now()+i })) ?? null })
				})}>Save sample</button>}
			</div>
			
			{sample?.filters && <div style={{ textAlign: 'center' }}>
				{sample.filters.map((filter) => <FilterCard key={filter.id} filter={filter} disabled={!allowEdit}/>)}
			</div>}
			{sample && !allowEdit && <div style={{ padding: '6px' }}>
				{sampleStats}
				<span style={{ marginLeft: '1em', color: 'var(--color-text-dark)' }}>by {sample.authors.join(',')}</span>				
			</div>}
			{allowEdit && <>
				<div style={{ marginTop: '4px' }}>
					{sampleStats}
				</div>
				<div style={{ marginTop: '8px' }}>
					<label className='MenuInput' style={{ margin: '0 8px 0 8px', padding: '2px', color: isPicking ? 'var(--color-magenta)' : 'unset' }}>
						editing mode<input checked={isPicking} onChange={(e) => setPicking(e.target.checked)} type='checkbox'/></label>
					<label className='MenuInput' style={{ margin: '0 6px 0 8px', padding: '2px' }}>
						public<input checked={sample.public} onChange={(e) => set({ public: e.target.checked })} type='checkbox'/></label>
					<button disabled={!unsavedChanges} style={{ width: '18ch', boxShadow: unsavedChanges ? '0 0 16px var(--color-active)' : 'none' }}
						onClick={() => mutate('update', {
							onSuccess: () => setHoverAuthors(0)
						})}>Save changes</button>
				</div>
				<div style={{ marginTop: '12px', verticalAlign: 'top' }}>
					<div style={{ display: 'inline-block', marginRight: '10px', width: '16em' }} onMouseEnter={()=>setHoverAuthors(a => a < 1 ? 1 : a)} onMouseLeave={()=>setHoverAuthors(a => a > 1 ? a : 0)}>
						{hoverAuthors === 0 && <span style={{ color: 'var(--color-text-dark)' }}>by {sample.authors.join(',')}</span>}
						{hoverAuthors === 1 && <button style={{ color: 'var(--color-active)', width: '12em' }}
							onClick={()=>setHoverAuthors(2)}>Edit authors?</button>}
						{hoverAuthors === 2 && <span>by <input autoFocus defaultValue={sample.authors.join(',')}
							onChange={e => set({ authors: e.target.value.trim().split(/[,\s]+/g).sort() })}></input></span>}
					</div>
					<button style={{ width: '18ch' }} onClick={askConfirmation}>Delete sample</button>
				</div>
			</>}
			{filters.length > 0 && <div className='Filters' style={{ padding: '2px 0 2px 0' }}>
				{filters.map(filter => <FilterCard key={filter.id} filter={filter}/>)}
			</div>}
		</div>
	);
}