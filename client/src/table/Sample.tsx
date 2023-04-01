import { useContext, useEffect, useLayoutEffect, useState } from 'react';
import { useEventListener, useMutationHandler } from '../util';
import { ColumnDef, TableContext, SampleContext } from './Table';
import { MenuInput, MenuSelect } from './TableMenu';

type SetFiltersType = (fn: (val: Filter[]) => Filter[]) => void;

const FILTER_OPS = ['>=' , '<=' , '==', '<>' , 'is null', 'not null' , 'includes' , 'in list'] as const;
type FilterParams = {
	column: string,
	operation: typeof FILTER_OPS[number],
	value: string,
};
type Filter = FilterParams & {
	id: number,
	fn?: (row: any[]) => boolean 
};

export type Sample = {
	id: number,
	name: string,
	authors: string[],
	filters: FilterParams[] | null,
	whitelist: number[],
	blacklist: number[]
};

function FilterCard({ filter: filterOri, setFilters }: { filter: Filter, setFilters: SetFiltersType }) {
	const { columns } = useContext(TableContext);
	const [filter, setFilter] = useState({ ...filterOri, input: filterOri.value });
	const [invalid, setInvalid] = useState(false);

	const { column: columnId, operation, input: inputRaw } = filter;
	const column = columns.find(c => c.id === columnId)!;

	const isSelectInput = column.type === 'enum' && operation !== 'includes' && operation !== 'in list';
	const input = isSelectInput && !column.enum?.includes(inputRaw) ? column.enum?.[0] as string : inputRaw;

	useEffect(() => {
		const setFn = (fn: Filter['fn']) => setFilters(filters => filters.map(fl => fl.id !== filter.id ? fl : { ...filter, fn }));
		const columnIdx = columns.findIndex(c => c.id === column.id);
		if (operation === 'is null')
			return setFn(row => row[columnIdx] == null);
		if (operation === 'not null')
			return setFn(row => row[columnIdx] != null);
		if (operation === 'includes')
			return setFn(row => row[columnIdx]?.toString().includes(input));
		const inp = input.trim().split(column.type === 'time' ? /[,|/]+/g : /[\s,|/]+/g);
		const values = inp.map((val) => {
			switch (column.type) {
				case 'time': return new Date(val.includes(' ') ? val.replace(' ', 'T')+'Z' : val);
				case 'real': return parseFloat(val);
				case 'integer': return parseInt(val);
				default: return val;
			}
		});
		const isValid = values.map((val) => {
			switch (column.type) {
				case 'time': return !isNaN(val as any);
				case 'real':
				case 'integer': return !isNaN(val as number);
				case 'enum': return column.enum?.includes(val as string);
				default: return (val as string).length > 0;
			}
		});
		if (!values.length || isValid.includes(false))
			return setInvalid(true);
		setInvalid(false);
		const value = values[0];
		const filterFn = (() => {
			switch (operation) {
				case '>=': return (v: any) => v >= value;
				case '<=': return (v: any) => v <= value;
				case '==': return (v: any) => v === value;
				case '<>': return (v: any) => v !== value;
				case 'in list': return (v: any) => values.includes(v);
			}
		})();
		setFn(row => filterFn(row[columnIdx]));
	}, [columns, column, operation, input, filter.id, setFilters, filter]);

	const destruct = () => setFilters(filters => filters.filter(fl => fl.id !== filter.id));
	const set = (what: string) => (e: any) => setFilter({ ...filter, [what]: e.target.value });

	return (
		<div className='FilterCard' onKeyDown={e => e.code === 'Escape' && (e.target as HTMLElement).blur?.()}>
			<select style={{ width: '8em', textAlign: 'right', borderColor: 'transparent' }} 
				value={column.id} onChange={set('column')}>
				{columns.filter(col => !col.hidden).map(col => <option value={col.id} key={col.table+col.name}>
					{col.fullName}</option>)}
			</select>
			<select style={{ width: operation.includes('null') ? '8em' : '62px', textAlign: 'center', borderColor: 'transparent' }} value={operation} onChange={set('operation')}>
				{FILTER_OPS.map(op => <option key={op} value={op}>{op}</option>)}
			</select>
			{!operation.includes('null') && !isSelectInput &&
			<input autoFocus type={'text'} style={{ width: '7em', textAlign: 'center', ...(invalid && { borderColor: 'var(--color-red)' }) }}
				value={input} onChange={set('input')}/>}
			{!operation.includes('null') && isSelectInput &&
			<select style={{ width: 'calc(7em - 4px)' }} value={input} onChange={set('input')}>
				{column.enum?.map(val => <option key={val} value={val}>{val}</option>)}
			</select>}
			<span className='CloseButton' onClick={destruct}>
				&times;
			</span>
		</div>
	);
}

export function SampleInput({ setSample }: { setSample: (a: any[][]) => void }) {
	const { data } = useContext(TableContext);
	const [filters, setFilters] = useState<Filter[]>([]);

	useLayoutEffect(() => {
		setSample(data.filter(row => !filters.some(fltr => fltr.fn && !fltr.fn(row))));
	}, [filters, data, setSample]);

	return (<div className='Filters'>
		{ filters.map(filter => <FilterCard key={filter.id} {...{ filter, setFilters }}/>) }
	</div>);
}

function applySample(sample: string | null, data: any[][]) {
	return data;
}

export function TableSampleInput({ cursorColumn, cursorValue }:
{ cursorColumn: ColumnDef | null, cursorValue: any | null }) {
	const { data } = useContext(TableContext);
	const { sample, setData } = useContext(SampleContext);
	const [filters, setFilters] = useState<Filter[]>([]);

	useLayoutEffect(() => {
		setData(applySample(sample, data).filter(row => !filters.some(fltr => fltr.fn && !fltr.fn(row))));
	}, [filters, data, sample, setData]);

	useEventListener('action+addFilter', () => setFilters(fltrs => {
		if (!cursorColumn)
			return [...fltrs, { column: 'magnitude', operation: '>=', value: '', id: Date.now() }];
		const column = cursorColumn;
		const val = cursorValue;
		const operation = val == null ? 'not null' : column.type === 'enum' ? '==' : column.type === 'text' ? 'includes' : '>=';
		const value = (column.type === 'time' ? val?.toISOString().replace(/T.*/,'') : val?.toString()) ?? '';
		return [...fltrs, { column: column.id, operation, value, id: Date.now() }];
	}));
	useEventListener('action+removeFilter', () => setFilters(fltrs => fltrs.slice(0, -1)));

	if (filters.length < 1)
		return null;
	return (<div className='Filters'>
		{ filters.map(filter => <FilterCard key={filter.id} {...{ filter, setFilters }}/>) }
	</div>);
}

export function SampleMenu() {
	const { sample, setSample } = useContext(SampleContext);
	const [state, setState] = useState({ name: '' });
	const set = (key: string) => (value: any) => setState({ ...state, [key]: value });

	const { mutate, report, color } = useMutationHandler(async (action) => {
		const body = (() => {
			switch (action) {
				case 'create': return { name: state.name };
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
		return await res.text();
	}, 'samples');

	return (
		<div> 
			<MenuSelect text='Sample' width='12em' value={sample} options={[]} callback={setSample} withNull={true}/>
			{/* <details style={{ userSelect: 'none', cursor: 'pointer' }} onClick={e => e.stopPropagation()}> */}
			<div><MenuInput text='Name' style={{ width: '20em', margin: '4px' }} value={state.name} onChange={set('name')}/></div>
			<div style={{ display: 'flex', justifyContent: 'space-between' }}>
				<span style={{ color, width: '11em', textAlign: 'right', marginTop: '4px' }}>{report?.error ?? report?.success}</span>
				{!sample && <button style={{ marginRight: '4px', width: '18ch', height: '1.5em' }} onClick={() => mutate('create')}>Create new sample</button>}
			</div>
		</div>
	);
}