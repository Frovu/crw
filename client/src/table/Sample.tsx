import { useContext, useLayoutEffect, useState } from 'react';
import { AuthContext } from '../App';
import { useEventListener, useMutationHandler } from '../util';
import { ColumnDef, TableContext, SampleContext } from './Table';
import { ConfirmationPopup, MenuInput, MenuSelect } from './TableMenu';

const FILTER_OPS = ['>=' , '<=' , '==', '<>' , 'is null', 'not null' , 'includes' , 'in list'] as const;
type Filter = {
	column: string,
	operation: typeof FILTER_OPS[number],
	value: string,
};

export type Sample = {
	id: number,
	name: string,
	authors: string[],
	public: boolean,
	filters: Filter[] | null,
	whitelist: number[],
	blacklist: number[]
};
type FilterWithId = Filter & { id: number };
export type SampleState = null | (Omit<Sample, 'filters'> & { filters: null | FilterWithId[] });

function parseFilterValues(str: string, column: ColumnDef) {
	return str.split(column.type === 'time' ? /[,|/]+/g : /[\s,|/]+/g).map((val) => {
		switch (column.type) {
			case 'time': return new Date(val.includes(' ') ? val.replace(' ', 'T')+'Z' : val);
			case 'real': return parseFloat(val);
			case 'integer': return parseInt(val);
			default: return val;
		}
	});
}

function FilterCard({ filter: filterOri, callback, disabled }:
{ filter: Filter, disabled?: boolean, callback: (a: Filter | null) => void }) {
	const { columns } = useContext(TableContext);
	const [filter, setFilter] = useState({ ...filterOri });
	const [invalid, setInvalid] = useState(false);

	const column = columns.find(c => c.id === filter.column);
	const { value, operation } = filter;

	const isSelectInput = column && column.type === 'enum' && operation !== 'includes' && operation !== 'in list';

	const checkInvalid = (fl: Filter) => {
		const col = columns.find(c => c.id === fl.column);
		if (!col) return true;
		if (['is null', 'not null', 'includes'].includes(fl.operation))
			return false;
		const values = parseFilterValues(fl.value, col);
		const isValid = values.map((val) => {
			switch (col.type) {
				case 'time': return !isNaN(val as any);
				case 'real':
				case 'integer': return !isNaN(val as number);
				case 'enum': return col.enum?.includes(val as string);
				default: return (val as string).length > 0;
			}
		});
		if (!values.length || isValid.includes(false))
			return true;
		if (values.length > 1 && fl.operation !== 'in list')
			return true;
		return false;
	};

	useLayoutEffect(() => setInvalid(checkInvalid(filter)), [filter]); // eslint-disable-line

	const set = (what: string) => (e: any) => {
		if (!column) return;
		const fl = { ...filter, [what]: e.target.value.trim() };
		if (column.enum && !column.enum.includes(fl.value))
			fl.value = column.enum[0];
		setFilter(fl);
		const isInvalid = checkInvalid(fl);
		if (isInvalid)
			return setInvalid(isInvalid);
		callback(fl);
	};
	
	return (
		<div className='FilterCard' onKeyDown={e => e.code === 'Escape' && (e.target as HTMLElement).blur?.()}>
			<select disabled={disabled} style={{ width: '8em', textAlign: 'right', borderColor: column ? 'transparent' : 'var(--color-red)' }} 
				value={filter.column} onChange={set('column')}>
				{columns.filter(col => !col.hidden).map(col =>
					<option value={col.id} key={col.table+col.name}>{col.fullName}</option>)}
				{!column && <option value={filter.column} key={filter.column}>{filter.column}</option>}
			</select>
			<select disabled={disabled} style={{ width: operation.includes('null') ? '8em' : '62px', textAlign: 'center', borderColor: 'transparent', marginRight: '4px' }} value={operation} onChange={set('operation')}>
				{FILTER_OPS.map(op => <option key={op} value={op}>{op}</option>)}
			</select>
			{!operation.includes('null') && !isSelectInput &&
			<input disabled={disabled} type={'text'} style={{ width: '7em', textAlign: 'center', ...(invalid && { borderColor: 'var(--color-red)' }) }}
				value={value} onChange={set('value')}/>}
			{!operation.includes('null') && isSelectInput &&
			<select disabled={disabled} style={{ width: 'calc(7em - 4px)' }} value={value} onChange={set('value')}>
				{column.enum?.map(val => <option key={val} value={val}>{val}</option>)}
			</select>}
			{!disabled && <span className='CloseButton' onClick={() => callback(null)}>
				&times;
			</span>}
		</div>
	);
}

function renderFilters(filters: Filter[], columns: ColumnDef[]) {
	const fns = filters.map(fl => {
		const columnIdx = columns.findIndex(c => c.id === fl.column);
		if (columnIdx < 0) return null;
		const column = columns[columnIdx];
		const fn = (() => {
			const { operation } = fl;
			if (operation === 'is null')
				return (v: any) => v == null;
			if (operation === 'not null')
				return (v: any) => v != null;
			if (operation === 'includes')
				return (v: any) => v?.toString().includes(fl.value);
			if (!fl.value) return null;
			const values = parseFilterValues(fl.value, column);
			const value = values[0];
			switch (operation) {
				case '>=': return (v: any) => v >= value;
				case '<=': return (v: any) => v <= value;
				case '==': return (v: any) => v === value;
				case '<>': return (v: any) => v !== value;
				case 'in list': return (v: any) => values.includes(v);
			}
		})();
		return fn && ((row: any[]) => fn(row[columnIdx]));
	}).filter(fn => fn) as ((row: any[]) => boolean)[];
	return (row: any[]) => !fns.some(fn => !fn(row));
}

export function applySample(data: any[][], sample: Sample | null, columns: ColumnDef[]) {
	if (!sample) return data;
	const filter = sample.filters?.length && renderFilters(sample.filters, columns);	
	return data.filter(row => (filter ? filter(row) : !sample.whitelist.length) || sample.whitelist.includes(row[0]))
		.filter(row => !sample.blacklist.includes(row[0]));
}

export function sampleEditingMarkers(data: any[][], sample: Sample, columns: ColumnDef[]) {
	const filterFn = sample.filters && renderFilters(sample.filters, columns);
	return data.map(row => {
		const fl = filterFn && filterFn(row) && 'f';
		const wl = sample.whitelist.includes(row[0]) && '+'; 
		const bl = sample.blacklist.includes(row[0]) && '-'; 

		return (fl || ' ') + (wl || bl || ' ');
	});
}

export function TableSampleInput({ cursorColumn, cursorValue }:
{ cursorColumn: ColumnDef | null, cursorValue: any | null }) {
	const { data, columns } = useContext(TableContext);
	const { sample, setData, isEditing } = useContext(SampleContext);
	const [filters, setFilters] = useState<{ filter: Filter, id: number }[]>([]);

	useLayoutEffect(() => {
		console.log('%ccompute sample', 'color: magenta');
		const applied = isEditing ? data.map(row => [...row]) : applySample(data, sample, columns);
		const filterFn = renderFilters(filters.map(f => f.filter), columns);
		setData(applied.filter(row => filterFn(row)));
	}, [filters, data, columns, sample, isEditing, setData]);

	useEventListener('action+addFilter', () => setFilters(fltrs => {
		if (!cursorColumn)
			return [...fltrs, { filter: { column: 'magnitude', operation: '>=', value: '3' }, id: Date.now() }];
		const column = cursorColumn;
		const val = cursorValue;
		const operation = val == null ? 'not null' : column.type === 'enum' ? '==' : column.type === 'text' ? 'includes' : '>=';
		const value = (column.type === 'time' ? val?.toISOString().replace(/T.*/,'') : val?.toString()) ?? '';
		return [...fltrs, { filter: { column: column.id, operation, value }, id: Date.now() }];
	}));
	useEventListener('action+removeFilter', () => setFilters(fltrs => fltrs.slice(0, -1)));

	if (filters.length < 1)
		return null;
	return (
		<div className='Filters'>
			{ filters.map(({ filter, id }) => <FilterCard key={id} {...{ filter, callback: (fl) =>  {
				if (!fl) return setFilters(fltrs => fltrs.filter((f) => f.id !== id));
				setFilters(fltrs => fltrs.map(f => f.id !== id ? f : { id: f.id, filter: fl }));
			} }}/>) }
		</div>
	);
}

export function SampleMenu() {
	const { sample, setSample, isEditing, setEditing, samples } = useContext(SampleContext);
	const { data: tableData, columns } = useContext(TableContext);
	const { login, role } = useContext(AuthContext);
	const [nameInput, setNameInput] = useState('');
	const [hoverAuthors, setHoverAuthors] = useState(0);
	const [confirmAction, askConfirmation] = useState<null | (() => void)>(null);
	const set = (key: string) => (value: any) => setSample(state => state && ({ ...state, [key]: value }));
	const setSelectSample = (name: string | null) => {
		const smpl = name && samples.find(s => s.name === name);
		if (!name || !smpl) {
			setNameInput('');
			return setSample(null);
		}
		setEditing(false);
		setSample({ ...smpl, filters: smpl.filters && smpl.filters.map((f, i) => ({ ...f, id: Date.now()+i })) });
	};

	const stripFilters = sample && { ...sample, filters: sample.filters && sample.filters.map(({ column, operation, value }) => ({ column, operation, value })) };
	const stateJson = JSON.stringify(stripFilters);
	const { mutate, report, color } = useMutationHandler(async (action: 'create' | 'remove' | 'update') => {
		const body = (() => {
			switch (action) {
				case 'create': return { name: nameInput };
				case 'remove': return { id: sample?.id };
				case 'update': return stripFilters;
			}
		})();
		const res = await fetch(`${process.env.REACT_APP_API}api/events/samples/${action}`, {
			method: 'POST', credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body) 
		});
		if (res.status === 400)
			throw new Error(await res.text());
		if (res.status !== 200)
			throw new Error('HTTP '+res.status);
		return action === 'create' ? await res.json() : await res.text();
	}, ['samples']);

	const setFilters = (fn: (a: FilterWithId[]) => FilterWithId[]) => setSample(st => st && ({ ...st, filters: st.filters && fn(st.filters) }));
	const newFilter = () => setSample(st => st && ({ ...st, filters: [
		...(st.filters ?? []), { ...(st.filters?.length ? st.filters[st.filters.length-1] : { column: 'magnitude', operation: '>=', value: '3' }), id: Date.now() }
	] }));

	const unsavedChanges = !samples.some(s => stateJson === JSON.stringify(s));
	const allowEdit = sample && samples.find(s => s.id === sample.id)?.authors.includes(login!);

	const applied = applySample(tableData, sample, columns);
	const whitelisted = sample && sample.whitelist.filter(id => tableData.find(row => row[0] === id)).length;
	const blacklisted = sample && sample.blacklist.filter(id => tableData.find(row => row[0] === id)).length;
	const sampleStats = sample && (<span style={{ marginRight: '8px' }}>
		<span style={{ color: whitelisted ? 'var(--color-cyan)' : 'var(--color-text-dark)' }}>[+{whitelisted}{sample.whitelist.length ? '/' + sample.whitelist.length : ''}]</span>
		<span style={{ color: blacklisted ? 'var(--color-magenta)' : 'var(--color-text-dark)' }}> [-{blacklisted}{sample.blacklist.length ? '/' + sample.blacklist.length : ''}]</span>
		<span style={{ color: 'var(--color-text-dark)' }}> = [{applied.length}]</span>
	</span>);
	return (
		<div style={{ marginTop: '4px' }}>
			{confirmAction && <ConfirmationPopup text={'Sample deletion is irreversible. Proceed?'} confirm={confirmAction} close={() => askConfirmation(null) }/>}
			<MenuSelect text='Sample' width='14em' value={sample?.name ?? null} options={samples.map(s => s.name)} callback={setSelectSample} withNull={true}/>
			<div>
				<MenuInput text='Name' style={{ width: sample ? '23em' : 'calc(14em + 8px)', margin: '8px 4px 0 4px', color: 'var(--color-text)' }}
					value={sample?.name ?? nameInput} disabled={sample && !allowEdit} onChange={allowEdit ? set('name') : setNameInput}/>
			</div>
			{!sample && role && <button style={{ margin: '8px 4px 0 0', width: '18ch', height: '1.5em' }} onClick={() => mutate('create', {
				onSuccess: (smpl: Sample) => setSample({ ...smpl, filters: smpl.filters?.map((f, i) => ({ ...f, id: Date.now()+i })) ?? null })
			})}>Create new sample</button>}
			{sample?.filters && <div style={{ textAlign: 'center', margin: '8px 0 12px 0', width: '26em' }}>
				{ sample.filters.map((filter) => <FilterCard disabled={!allowEdit} key={filter.id} {...{ filter, callback: (fl) =>  {
					if (!fl) return setFilters(fltrs => fltrs.filter((f) => f.id !== filter.id));
					setFilters(fltrs => fltrs.map(f => f.id !== filter.id ? f : { id: f.id, ...fl }));
				} }}/>) }
			</div>}
			{sample && !allowEdit && <div style={{ padding: '6px' }}>
				{sampleStats}
				<span style={{ marginLeft: '1em', color: 'var(--color-text-dark)' }}>by {sample.authors.join(',')}</span>				
			</div>}
			{allowEdit && <>
				<div style={{ marginTop: '4px' }}>
					{sampleStats}
					<button style={{ width: '18ch' }} onClick={newFilter}>Add filter</button>
				</div>
				<div style={{ marginTop: '8px' }}>
					<label className='MenuInput' style={{ margin: '0 8px 0 8px', padding: '2px', color: isEditing ? 'var(--color-magenta)' : 'unset' }}>
						editing mode<input checked={isEditing} onChange={(e) => setEditing(e.target.checked)} type='checkbox'/></label>
					<label className='MenuInput' style={{ margin: '0 6px 0 8px', padding: '2px' }}>
						public<input checked={sample.public} onChange={(e) => set('public')(e.target.checked)} type='checkbox'/></label>
					<button disabled={!unsavedChanges} style={{ width: '18ch', boxShadow: unsavedChanges ? '0 0 16px var(--color-active)' : 'none' }}
						onClick={() => mutate('update', {
							onSuccess: () => setHoverAuthors(0)
						})}>Save changes</button>
				</div>
				<div style={{ marginTop: '12px', verticalAlign: 'top' }}>
					<div style={{ display: 'inline-block', marginRight: '10px', width: '16em' }} onMouseEnter={()=>setHoverAuthors(a => a < 1 ? 1 : a)} onMouseLeave={()=>setHoverAuthors(a => a > 1 ? a : 0)}>
						{hoverAuthors === 0 && <span style={{ color: 'var(--color-text-dark)' }}>by {sample.authors.join(',')}</span>}
						{hoverAuthors === 1 && <button style={{ color: 'var(--color-active)', width: '12em' }} onClick={()=>setHoverAuthors(2)}>Edit authors?</button>}
						{hoverAuthors === 2 && <span>by <input autoFocus defaultValue={sample.authors.join(',')} onChange={e => set('authors')(e.target.value.trim().split(/[,\s]+/g).sort())}></input></span>}
					</div>
					<button style={{ width: '18ch' }} onClick={() => askConfirmation(() => () => mutate('remove', {
						onSuccess: () => setSelectSample(null)
					}))}>Delete sample</button>
				</div>
			</>}
			<div style={{ color, height: '18px', padding: '4px 4px 0 0', textAlign: 'right' }}>{report?.success ? 'OK' : report?.error}</div>
		</div>
	);
}