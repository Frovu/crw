import { useState, useRef, useEffect, createContext, useContext, useMemo } from 'react';
import { ColumnDef, Filter, TableContext } from './Table';

function FilterCard({ callback }: { callback: (filter: Filter) => void }) {
	return (
		<div className='FilterCard'>
			
		</div>
	);
}

export function FiltersView({ setFilters }: { setFilters: (func: (val: Filter[]) => Filter[]) => void }) {
	const [cards, setCards] = useState<number[]>([]);
	return (
		<div style={{ width: '480px' }}>
			<button onClick={()=>setCards(cr => [...cr, cards.length])}>Add filter</button>
			{cards.map((k, idx) =>
				<FilterCard key={k} callback={fn => setFilters(filters => [...filters].map((f, i) => i === idx ? fn : f))}/>)}
		</div>
	);

}

export function ColumnsView() {

}