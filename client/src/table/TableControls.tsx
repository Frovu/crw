import { useState, useRef, useEffect, createContext, useContext, useMemo } from 'react';
import { ColumnDef, Filter, TableContext } from './Table';

const FILTER_OPS = ['>=', '<=', '==', 'not null', 'in list'];

let aVeryUniqueId = 0;
function nextIdx() {
	return ++aVeryUniqueId;
}

function FilterCard({ callback, destruct }: { callback: (filter: Filter) => void, destruct: () => void }) {
	const { data, columns } = useContext(TableContext);
	const [column, setColumn] = useState(0);
	const [operation, setOperation] = useState(FILTER_OPS[0]);
	const [input, setInput] = useState('');
	const fisrtTable = columns[0].table;

	function onInput(str: string) {
		setInput(str);
	}

	return (
		<div className='FilterCard'>
			<select style={{ textAlign: 'right', width: '12em' }} value={column} onChange={e => setColumn(parseInt(e.target.value))}>
				{columns.map((col, i) => <option value={i} key={col.table+col.name}>{col.name}{col.table !== fisrtTable ? ' of ' + col.table : ''}</option>)}
			</select>
			<select style={{ textAlign: 'center' }} value={operation} onChange={e => setOperation(e.target.value)}>
				{FILTER_OPS.map(op => <option key={op} value={op}>{op}</option>)}
			</select>
			{operation !== 'not null' && <input type='text' style={{ width: '12em' }}
				value={input} onChange={e => onInput(e.target.value)}/>}
			<button onClick={destruct}>delete</button>
		</div>
	);
}

export function FiltersView({ setFilters }: { setFilters: (func: (val: Filter[]) => Filter[]) => void }) {
	const [cards, setCards] = useState<number[]>([]);
	
	return (
		<div style={{ width: '480px' }}>
			<button onClick={()=>setCards(cr => [...cr, nextIdx()])}>Add filter</button>
			{cards.map((k, idx) =>
				<FilterCard key={k} destruct={()=>{console.log(idx);setCards(cr => cr.filter((a,i) => i !== idx)); setFilters(fl => fl.filter((a,i) => i !== idx));}}
					callback={fn => setFilters(filters => [...filters].map((f, i) => i === idx ? fn : f))}/>)}
		</div>
	);

}

export function ColumnsView() {

}