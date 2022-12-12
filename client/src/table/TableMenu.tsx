import { useState, useEffect, useContext, Fragment, ReactNode } from 'react';
import { TableContext, prettyName } from './Table';
import { useEventListener, dispatch } from '../util';

type FilterArgs = { filters: Filter[], setFilters: (fn: (val: Filter[]) => Filter[]) => void };
type ColumnsArgs = { enabledColumns: string[], setEnabledColumns: (f: (c: string[]) => string[]) => void };

const FILTER_OPS = ['>=' , '<=' , '==' , 'not null' , 'includes' , 'in list'] as const;
export type Filter = {
	column: string,
	operation: typeof FILTER_OPS[number],
	input: string,
	id: number,
	fn?: (row: any[]) => boolean 
};

const KEY_COMB = {
	'openColumnsSelector': 'Ctrl+R',
	'addFilter': 'Ctrl+F'
} as { [action: string]: string };

function FilterCard({ filter: filterOri, setFilters }: { filter: Filter, setFilters: FilterArgs['setFilters'] }) {
	const { columns, fisrtTable } = useContext(TableContext);
	const [ filter, setFilter ] = useState(filterOri);
	const [invalid, setInvalid] = useState(false);

	const { column: columnId, operation, input: inputRaw } = filter;
	const column = columns[columnId];

	const isSelectInput = column.type === 'enum' && operation !== 'includes' && operation !== 'in list';
	const input = isSelectInput && !column.enum?.includes(inputRaw) ? column.enum?.[0] as string : inputRaw;

	useEffect(() => {
		const setFn = (fn: Filter['fn']) => setFilters(filters => filters.map(fl => fl.id !== filter.id ? fl : { ...filter, fn }));
		const columnIdx = Object.keys(columns).indexOf(column.id);
		if (operation === 'not null')
			return setFn(row => row[columnIdx] != null);
		if (operation === 'includes')
			return setFn(row => row[columnIdx]?.includes(input));
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
				case 'in list': return (v: any) => values.includes(v);
			}
		})();
		setFn(row => filterFn(row[columnIdx]));
	}, [columns, column, operation, input, filter.id, setFilters, filter]);

	const destruct = () => setFilters(filters => filters.filter(fl => fl.id !== filter.id));
	const set = (what: string) => (e: any) => setFilter({ ...filter, [what]: e.target.value });

	return (
		<div className='FilterCard'>
			<div>
				<select style={{ textAlign: 'right', borderColor: 'transparent' }} 
					value={column.id} onChange={set('column')}>
					{Object.values(columns).map(col => <option value={col.id} key={col.table+col.name}>
						{col.name}{col.table !== fisrtTable ? ' of ' + prettyName(col.table).replace(/([A-Z])[a-z ]+/g, '$1') : ''}</option>)}
				</select>
				<select style={{ textAlign: 'center', borderColor: 'transparent' }} value={operation} onChange={set('operation')}>
					{FILTER_OPS.map(op => <option key={op} value={op}>{op}</option>)}
				</select>
				{operation !== 'not null' && !isSelectInput &&
				<input autoFocus type={'text'} style={{ width: '8em', textAlign: 'center', ...(invalid && { borderColor: 'red' }) }}
					value={input} onChange={set('input')} onKeyDown={(e) => e.ctrlKey && e.key === 'Delete' && destruct()}/>}
				{operation !== 'not null' && isSelectInput &&
				<select style={{ width: '8em' }} value={input} onChange={set('input')}>
					{column.enum?.map(val => <option key={val} value={val}>{val}</option>)}
				</select>}
			</div>
			<button style={{ marginLeft: '1em' }} onClick={destruct}>remove</button>
		</div>
	);
}

function ColumnsSelector({ enabledColumns, setEnabledColumns }: ColumnsArgs) {
	const { columns: columnsMap } = useContext(TableContext);
	const columns = Object.values(columnsMap);
	const tables = [...new Set(columns.map(c => c.table as string))];
	const sortFn = (a: string, b: string) => Object.keys(columnsMap).indexOf(a) - Object.keys(columnsMap).indexOf(b);
	const columnChecks = columns.map(col => [col,
		<label key={col.table+col.name} style={{ marginLeft: '.5em' }}><input type='checkbox' checked={enabledColumns.includes(col.id)}
			onChange={e=>setEnabledColumns(cols => [...cols.filter(c => c !== col.id), ...(e.target.checked ? [col.id] : [])].sort(sortFn))}/>{col.name}</label>]);
	return (
		<div className='ColumnsSelector'>
			{tables.map(table => <Fragment key={table}>
				<b key={table} style={{ marginBottom: '4px', maxWidth: '10em' }}>{prettyName(table)}</b>
				<>{columnChecks.filter(([col,]) => (col as any).table === table).map(([col, el]) => el)}</>
			</Fragment>)}
		</div>
	);
}

function MenuButton({ text, action, callback }: { text: string, action: string, callback?: () => void }) {
	const keyComb = KEY_COMB[action];
	return (
		<button className='MenuItem' onClick={() => dispatch('action+' + action)}>
			<span>{text}</span>
			{keyComb && <span className='keyComb'>{keyComb}</span>}
		</button>
	);
}

function MenuSection({ name, children }: { name: string, children: ReactNode }) {
	const [open, setOpen] = useState(false);
	useEventListener('escape', () => setOpen(false));

	return (
		<div>
			<button onClick={()=>setOpen(!open)}>
				{name}
			</button>
			{open && <div className='MenuDropdown' onClick={() => setOpen(false)}>
				{children}
			</div>}
		</div>
	);
}

function onKeydown(e: KeyboardEvent) {
	if (e.key === 'Escape')
		return dispatch('escape');
	if (!e.ctrlKey || e.key === 'Control')
		return;
	console.log(e.ctrlKey ? 'ctrl' : '', e.key, );
	const action = Object.keys(KEY_COMB).find(k => KEY_COMB[k] === 'Ctrl+' + e.key.toUpperCase());
	if (action) {
		e.preventDefault();
		dispatch('action+' + action);
	}
}

export function Menu({ filters, setFilters, enabledColumns, setEnabledColumns }: FilterArgs & ColumnsArgs) {
	const [showColumns, setShowColumns] = useState(false);
	useEventListener('escape', () => setShowColumns(false));
	useEventListener('action+openColumnsSelector', () => setShowColumns(show => !show));

	useEventListener('keydown', onKeydown);

	return (
		<div className='Menu'>
			<MenuSection name='View'>
				<MenuButton text='Add filter' action='addFilter'/>
				<MenuButton text='Set columns' action='openColumnsSelector'/>
			</MenuSection>
			{showColumns && <ColumnsSelector {...{ enabledColumns, setEnabledColumns }}/>}
			{filters.length > 0 && <div className='Filters'>
				{ filters.map(filter => <FilterCard key={filter.id} {...{ filter, setFilters }}/>) }
			</div>}
		</div>
	);
}