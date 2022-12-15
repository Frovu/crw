import { useState, useEffect, useContext, Fragment, ReactNode, useMemo } from 'react';
import { TableContext, DataContext, prettyName } from './Table';
import { useEventListener, dispatchCustomEvent } from '../util';

type FilterArgs = { filters: Filter[], setFilters: (fn: (val: Filter[]) => Filter[]) => void };
type ColumnsArgs = { enabledColumns: string[], setEnabledColumns: (f: (c: string[]) => string[]) => void };

const FILTER_OPS = ['>=' , '<=' , '==' , 'is null', 'not null' , 'includes' , 'in list'] as const;
export type Filter = {
	column: string,
	operation: typeof FILTER_OPS[number],
	input: string,
	id: number,
	fn?: (row: any[]) => boolean 
};

const KEY_COMB = {
	'openColumnsSelector': 'C',
	'addFilter': 'F',
	'removeFilter': 'R'
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
		if (operation === 'is null')
			return setFn(row => row[columnIdx] == null);
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
			<div onKeyDown={e => e.code === 'Escape' && (e.target as HTMLElement).blur?.()}>
				<select style={{ textAlign: 'right', borderColor: 'transparent' }} 
					value={column.id} onChange={set('column')}>
					{Object.values(columns).map(col => <option value={col.id} key={col.table+col.name}>
						{col.name}{col.table !== fisrtTable ? ' of ' + prettyName(col.table).replace(/([A-Z])[a-z ]+/g, '$1') : ''}</option>)}
				</select>
				<select style={{ textAlign: 'center', borderColor: 'transparent' }} value={operation} onChange={set('operation')}>
					{FILTER_OPS.map(op => <option key={op} value={op}>{op}</option>)}
				</select>
				{!operation.includes('null') && !isSelectInput &&
				<input autoFocus type={'text'} style={{ width: '8em', textAlign: 'center', ...(invalid && { borderColor: 'var(--color-red)' }) }}
					value={input} onChange={set('input')}/>}
				{!operation.includes('null') && isSelectInput &&
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
		<MenuCheckbox key={col.id} text={col.name} value={enabledColumns.includes(col.id)} disabled={col.id === 'time'}
			callback={checked => setEnabledColumns(cols => [...cols.filter(c => c !== col.id), ...(checked ? [col.id] : [])].sort(sortFn))}/>]);
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
		<button className='MenuItem' onClick={() => dispatchCustomEvent('action+' + action)}>
			<span>{text}</span>
			{keyComb && <span className='keyComb'>{keyComb}</span>}
		</button>
	);
}

function MenuSection({ name, shownSection, setShownSection, children }:
{ name: string, shownSection: string | null, setShownSection: (s: string | null) => void, children: ReactNode }) {
	return (
		<div>
			<button onClick={e => {setShownSection(name); e.stopPropagation(); }}>
				{name}
			</button>
			{name === shownSection && <div className='MenuDropdown' onClick={e => { setShownSection(null); e.stopPropagation(); }}>
				{children}
			</div>}
		</div>
	);
}

function MenuCheckbox({ text, value, callback, hide, disabled }:
{ text: string, value: boolean, hide?: boolean, callback: (v: boolean) => void, disabled?: boolean }) {
	return (<label onClick={e => e.stopPropagation()} className='MenuInput'>
		<input type='checkbox' checked={value} disabled={disabled||false} onChange={e => callback(e.target.checked)} style={{ marginRight: '8px', display: hide ? 'none' : 'inline-block' }}/>{text}
	</label>);
}

function ExportMenu() {
	const { data: rData, columns: rColumns } = useContext(TableContext);
	const { data: fData, columns: fColumns } = useContext(DataContext);

	const [ filtered, setFiltered ] = useState(true);
	const [ format, setFormat ] = useState(false);
	
	const dataUrl = useMemo(() => {
		const data = filtered ? fData : rData;
		const columns = filtered ? fColumns : Object.values(rColumns);
		if (!format)
			return URL.createObjectURL(new Blob([JSON.stringify({ data, columns }, null, 2)], { type: 'application/json' }));

		let text = 'Note: plaintext export option has limitations and you should consider using JSON instead\r\nAll whitespace in values is replaced by _\r\n';
		text += columns.map(col => col.id.padStart(col.width + 4, ' '.repeat(col.width))).join(' ') + '\r\n';

		for (const row of data) {
			for (const [i, col] of columns.entries()) {
				const val = col.type === 'time' ? row[i]?.toISOString().replace(/\..+/,'Z') : row[i];
				text += (val == null ? 'N/A' : val).toString().replace(/\s/, '_').padStart(col.width + 4, ' '.repeat(col.width)) + ' ';
			}
			text += '\r\n';
		};
		return URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
	}, [fColumns, fData, filtered, format, rColumns, rData]);

	const fname = (filtered ? 'some_' : 'all_') + 'events' + (format ? '.txt' : '.json');
	return (
		<>
			<MenuCheckbox text={'format: '+(format?'plaintext':'JSON')} value={format} callback={setFormat} hide={true}/>
			<MenuCheckbox text='apply filters' value={filtered} callback={setFiltered}/>
			<a style={{ marginLeft: '.5em' }} href={dataUrl} download={fname}>download as a file</a>
		</>
	);
}

function onKeydown(e: KeyboardEvent) {
	if (e.code === 'Escape')
		return dispatchCustomEvent('escape');
	if (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox')
		return;
	const keycomb = (e.ctrlKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + e.code.replace(/Key|Digit/, '');
	const action = Object.keys(KEY_COMB).find(k => KEY_COMB[k] === keycomb);
	if (action) {
		e.preventDefault();
		dispatchCustomEvent('action+' + action);
	}
}

export function Menu({ filters, setFilters, enabledColumns, setEnabledColumns }: FilterArgs & ColumnsArgs) {
	const [showColumns, setShowColumns] = useState(false);
	const [shownSection, setShownSection] = useState<string | null>(null);

	useEventListener('escape', () => { setShowColumns(false); setShownSection(null); });
	useEventListener('click', () => {
		setShowColumns(false);
		setShownSection(null);
	});

	useEventListener('action+openColumnsSelector', () => setShowColumns(show => !show));
	useEventListener('keydown', onKeydown);

	return (
		<div>
			<div className='Menu'>
				<MenuSection name='Controls' {...{ shownSection, setShownSection }}>
					<MenuButton text='Add filter' action='addFilter'/>
					<MenuButton text='Remove filter' action='removeFilter'/>
					<MenuButton text='Select columns' action='openColumnsSelector'/>
				</MenuSection>
				<MenuSection name='Export' {...{ shownSection, setShownSection }}>
					<ExportMenu/>
				</MenuSection>
			</div>
			{showColumns && <ColumnsSelector {...{ enabledColumns, setEnabledColumns }}/>}
			{filters.length > 0 && <div className='Filters'>
				{ filters.map(filter => <FilterCard key={filter.id} {...{ filter, setFilters }}/>) }
			</div>}
		</div>
	);
}