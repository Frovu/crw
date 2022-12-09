import { useState, useRef, useEffect, createContext, useContext, useMemo } from 'react';
import { ColumnDef, Filter, TableContext } from './Table';

const FILTER_OPS = ['>=', '<=', '==', 'not null', 'in list'] as const;

function FilterCard({ callback, destruct }: { callback: (filter: Filter) => void, destruct: () => void }) {
	const { data, columns, fisrtTable } = useContext(TableContext);
	const [columnIdx, setColumnIdx] = useState(() => columns.findIndex(c => c.name === 'magnitude' && c.table === fisrtTable));
	const [operation, setOperation] = useState<typeof FILTER_OPS[number]>(FILTER_OPS[0]);
	const [invalid, setInvalid] = useState(false);
	const [input, setInput] = useState('10');

	useEffect(() => {
		if (operation === 'not null')
			return callback(v => v != null);
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
		const filter: Filter = (row: any[]) => filterFn(row);
		callback(filter);
	}, [columnIdx, input, operation, columns, setInvalid]); // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<div className='FilterCard'>
			<select style={{ textAlign: 'right', width: '12em' }} value={columnIdx} onChange={e => setColumnIdx(parseInt(e.target.value))}>
				{columns.map((col, i) => <option value={i} key={col.table+col.name}>{col.name}{col.table !== fisrtTable ? ' of ' + col.table : ''}</option>)}
			</select>
			<select style={{ textAlign: 'center' }} value={operation} onChange={e => setOperation(e.target.value as typeof FILTER_OPS[number])}>
				{FILTER_OPS.map(op => <option key={op} value={op}>{op}</option>)}
			</select>
			{operation !== 'not null' && <input type='text' style={{ width: '12em' }}
				value={input} onChange={e => setInput(e.target.value)}/>}
			<button onClick={destruct}>delete</button>
		</div>
	);
}

export function FiltersView({ setFilters }: { setFilters: (val: Filter[]) => void }) {
	const [cards, setCards] = useState(new Map<number, Filter | null>([]));
	const [uid, setUid] = useState(0);
	const nextKey = () => { setUid(uid+1); return uid; }; 

	useEffect(() => {
		setFilters(Array.from(cards.values()).filter((f): f is Filter => f != null));
	}, [cards, setFilters]);

	return (
		<div style={{ width: '480px' }}>
			<button onClick={() => setCards(crds => new Map(crds.set(nextKey(), null)))}>Add filter</button>
			{Array.from(cards.keys()).map((idx) =>
				<FilterCard key={idx}
					destruct={() => setCards(crds => new Map(Array.from(crds.entries()).filter(([k,]) => k !== idx)))}
					callback={fn => setCards(crds => new Map(crds.set(idx, fn)))}/>)}
		</div>
	);

}

export function ColumnsView() {

}