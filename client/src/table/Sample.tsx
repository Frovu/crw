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

function applyFilters(data: any[][], filters: Filter[], columns: ColumnDef[]) {
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
	}).filter(fn => fn);
	return data.filter(row => !fns.some(fn => !fn!(row)));
}

function applySample(data: any[][], sample: Sample | null, columns: ColumnDef[]) {
	if (!sample) return data;
	
	if (sample.filters)
		return applyFilters(data, sample.filters, columns); // TODO
	return data;
}

function FilterCard({ filter: filterOri, callback }: { filter: Filter, callback: (a: Filter | null) => void }) {
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
			<select style={{ width: '8em', textAlign: 'right', borderColor: column ? 'transparent' : 'var(--color-red)' }} 
				value={filter.column} onChange={set('column')}>
				{columns.filter(col => !col.hidden).map(col =>
					<option value={col.id} key={col.table+col.name}>{col.fullName}</option>)}
				{!column && <option value={filter.column} key={filter.column}>{filter.column}</option>}
			</select>
			<select style={{ width: operation.includes('null') ? '8em' : '62px', textAlign: 'center', borderColor: 'transparent' }} value={operation} onChange={set('operation')}>
				{FILTER_OPS.map(op => <option key={op} value={op}>{op}</option>)}
			</select>
			{!operation.includes('null') && !isSelectInput &&
			<input type={'text'} style={{ width: '7em', textAlign: 'center', ...(invalid && { borderColor: 'var(--color-red)' }) }}
				value={value} onChange={set('value')}/>}
			{!operation.includes('null') && isSelectInput &&
			<select style={{ width: 'calc(7em - 4px)' }} value={value} onChange={set('value')}>
				{column.enum?.map(val => <option key={val} value={val}>{val}</option>)}
			</select>}
			<span className='CloseButton' onClick={() => callback(null)}>
				&times;
			</span>
		</div>
	);
}

export function TableSampleInput({ cursorColumn, cursorValue }:
{ cursorColumn: ColumnDef | null, cursorValue: any | null }) {
	const { data, columns } = useContext(TableContext);
	const { sample, setData } = useContext(SampleContext);
	const [filters, setFilters] = useState<{ filter: Filter, id: number }[]>([]);

	useLayoutEffect(() => {
		setData(applyFilters(applySample(data, sample, columns), filters.map(f => f.filter), columns));
	}, [filters, data, columns, sample, setData]);

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
	const { login, role } = useContext(AuthContext);
	const [nameInput, setNameInput] = useState('');
	const [hoverAuthors, setHoverAuthors] = useState(0);
	const [confirmAction, askConfirmation] = useState<null | (() => void)>(null);
	const { sample, setSample, samples } = useContext(SampleContext);
	const set = (key: string) => (value: any) => setSample(state => state && ({ ...state, [key]: value }));
	const setSelectSample = (name: string | null) => {
		const smpl = name && samples.find(s => s.name === name);
		if (!name || !smpl) {
			setNameInput('');
			return setSample(null);
		}
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
	return (
		<div>
			{confirmAction && <ConfirmationPopup text={'Sample deletion is irreversible. Proceed?'} confirm={confirmAction} close={() => askConfirmation(null) }/>}
			<MenuSelect text='Sample' width='14em' value={sample?.name ?? null} options={samples.map(s => s.name)} callback={setSelectSample} withNull={true}/>
			<div><MenuInput text='Name' style={{ width: sample ? '23em' : 'calc(14em + 8px)', margin: '4px' }}
				value={sample?.name ?? nameInput} disabled={sample && !allowEdit} onChange={allowEdit ? set('name') : setNameInput}/></div>
			{!sample && role && <button style={{ marginRight: '4px', width: '18ch', height: '1.5em' }} onClick={() => mutate('create', {
				onSuccess: (smpl: Sample) => setSample({ ...smpl, filters: smpl.filters?.map((f, i) => ({ ...f, id: Date.now()+i })) ?? null })
			})}>Create new sample</button>}
			{allowEdit && <div style={{ textAlign: 'center', margin: '8px 0 12px 0', width: '26em' }}>
				{ sample.filters?.map((filter) => <FilterCard key={filter.id} {...{ filter, callback: (fl) =>  {
					if (!fl) return setFilters(fltrs => fltrs.filter((f) => f.id !== filter.id));
					setFilters(fltrs => fltrs.map(f => f.id !== filter.id ? f : { id: f.id, ...fl }));
				} }}/>) }
			</div>}
			{allowEdit && <div style={{ marginTop: '4px' }}>
				<button style={{ width: '18ch' }} onClick={newFilter}>Add filter</button>
			</div>}
			{allowEdit && <div style={{ marginTop: '8px' }}>
				<button disabled={!unsavedChanges} style={{ width: '18ch', boxShadow: unsavedChanges ? '0 0 16px var(--color-active)' : 'none' }}
					onClick={() => mutate('update', {
						onSuccess: () => setHoverAuthors(0)
					})}>Save changes</button>
			</div>}
			{allowEdit && <div style={{ marginTop: '12px', verticalAlign: 'top' }}>
				<div style={{ display: 'inline-block', marginRight: '10px', width: '15em' }} onMouseEnter={()=>setHoverAuthors(a => a < 1 ? 1 : a)} onMouseLeave={()=>setHoverAuthors(a => a > 1 ? a : 0)}>
					{hoverAuthors === 0 && <span style={{ color: 'var(--color-text-dark)' }}>by {sample.authors.join(',')}</span>}
					{hoverAuthors === 1 && <button style={{ color: 'var(--color-active)', width: '12em' }} onClick={()=>setHoverAuthors(2)}>Edit authors?</button>}
					{hoverAuthors === 2 && <span>by <input autoFocus defaultValue={sample.authors.join(',')} onChange={e => set('authors')(e.target.value.trim().split(/[,\s]+/g).sort())}></input></span>}
				</div>
				<button style={{ width: '18ch' }} onClick={() => askConfirmation(() => () => mutate('remove', {
					onSuccess: () => setSelectSample(null)
				}))}>Delete sample</button>
			</div>}
			<div style={{ color, height: '18px', padding: '4px 4px 0 0', textAlign: 'right' }}>{report?.success ? 'OK' : report?.error}</div>
		</div>
	);
}