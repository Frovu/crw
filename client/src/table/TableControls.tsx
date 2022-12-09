import { useState, useEffect, useContext } from 'react';
import { Filter, TableContext } from './Table';

const FILTER_OPS = ['>=', '<=', '==', 'not null', 'in list'] as const;
const prettyName = (str: string) => str.split('_').map((s: string) => s.charAt(0).toUpperCase()+s.slice(1)).join(' ');

function FilterCard({ callback, destruct }: { callback: (filter: Filter) => void, destruct: () => void }) {
	const { columns, fisrtTable } = useContext(TableContext);
	const [columnIdx, setColumnIdx] = useState(() => columns.findIndex(c => c.name === 'magnitude' && c.table === fisrtTable));
	const [operation, setOperation] = useState<typeof FILTER_OPS[number]>(FILTER_OPS[0]);
	const [invalid, setInvalid] = useState(false);
	const [input, setInput] = useState('');

	useEffect(() => {
		if (operation === 'not null')
			return callback(row => row[columnIdx] != null);
		const column = columns[columnIdx];
		const inp = input.trim().split(/[\s,|/]+/g);
		const values = inp.map((val) => {
			switch (column.type) {
				case 'time': return new Date(val);
				case 'real': return parseFloat(val);
				case 'integer': return parseInt(val);
				default: return val;
			}
		});
		const isValid = values.map((val) => {
			switch (column.type) {
				case 'time': return !isNaN((val as Date).getTime());
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
		const filter: Filter = (row: any[]) => filterFn(row[columnIdx]);
		callback(filter);
	}, [columnIdx, input, operation, columns, setInvalid]); // eslint-disable-line react-hooks/exhaustive-deps

	const isSelectInput = columns[columnIdx].type === 'enum' && operation != 'in list'
	return (
		<div className='FilterCard'>
			<div>
				<select style={{ textAlign: 'right', width: '12em', borderColor: 'transparent' }} 
					value={columnIdx} onChange={e => setColumnIdx(parseInt(e.target.value))}>
					{columns.map((col, i) => <option value={i} key={col.table+col.name}>{col.name}{col.table !== fisrtTable ? ' of ' + prettyName(col.table as any) : ''}</option>)}
				</select>
				<select style={{ textAlign: 'center', borderColor: 'transparent' }} value={operation} onChange={e => setOperation(e.target.value as typeof FILTER_OPS[number])}>
					{FILTER_OPS.map(op => <option key={op} value={op}>{op}</option>)}
				</select>
				{operation !== 'not null' && !isSelectInput &&
				<input autoFocus type='text' style={{ width: '6em', textAlign: 'center', ...(invalid && { borderColor: 'red' }) }}
					value={input} onChange={e => setInput(e.target.value)}/>}
				{operation !== 'not null' && isSelectInput &&
				<select value={columns[columnIdx].enum?.includes(input) ? input : columns[columnIdx].enum?.[0]} onChange={e => setInput(e.target.value)}>
					{columns[columnIdx].enum?.map(val => <option key={val} value={val}>{val}</option>)}
				</select>}
			</div>
			<button onClick={destruct}>delete</button>
		</div>
	);
}

export function FiltersView({ setFilters }: { setFilters: (val: Filter[]) => void }) {
	const [cards, setCards] = useState(new Map<number, Filter | null>([]));
	const [uid, setUid] = useState(0);
	const nextKey = () => { setUid(uid+1); return uid; }; 

	useEffect(() => {
		setFilters([...cards.values()].filter((f): f is Filter => f != null));
	}, [cards, setFilters]);

	return (
		<div className='Filters'>
			{[...cards.keys()].map((idx) =>
				<FilterCard key={idx}
					destruct={() => setCards(crds => new Map([...crds.entries()].filter(([k,]) => k !== idx)))}
					callback={fn => setCards(crds => new Map(crds.set(idx, fn)))}/>)}
			<div className='AddFilter'>
				<button onClick={() => setCards(crds => new Map(crds.set(nextKey(), null)))}>Add filter</button>
			</div>
		</div>
	);

}

export function ColumnsSelector({ enabledColumns, setEnabledColumns }: { enabledColumns: number[], setEnabledColumns: (f: (c: number[]) => number[]) => void }) {
	const { columns } = useContext(TableContext);
	const tables = [...new Set(columns.map(c => c.table as string))];
	const columnChecks = columns.map((col, i) => [col,
		<label style={{ marginLeft: '.5em' }}><input type='checkbox' checked={enabledColumns.includes(i)}
			onChange={e=>setEnabledColumns(cols => [...cols.filter(c => c !== i), ...(e.target.checked ? [i] : [])])}/>{col.name}</label>]);
	return (
		<div className='ColumnsSelector'>
			{tables.map(table => <>
				<b style={{ marginBottom: '4px', maxWidth: '9em' }}>{prettyName(table)}</b>
				{columnChecks.filter(([col,]) => (col as any).table === table).map(([col, el]) => el)}
			</>)}
		</div>
	);
}