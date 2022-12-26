import { useState, useEffect, useContext, Fragment, ReactNode, useMemo } from 'react';
import { TableContext, DataContext, prettyName, SettingsContext, Settings, plotTypes, ColumnDef } from './Table';
import { useEventListener, dispatchCustomEvent } from '../util';

type FilterArgs = { filters: Filter[], setFilters: (fn: (val: Filter[]) => Filter[]) => void };

const FILTER_OPS = ['>=' , '<=' , '==', '<>' , 'is null', 'not null' , 'includes' , 'in list'] as const;
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
	'removeFilter': 'R',
	'plot': 'P',
	'plotPrev': 'BracketLeft%[',
	'plotNext': 'BracketRight%]',
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
		<div className='FilterCard'>
			<div onKeyDown={e => e.code === 'Escape' && (e.target as HTMLElement).blur?.()}>
				<select style={{ textAlign: 'right', borderColor: 'transparent' }} 
					value={column.id} onChange={set('column')}>
					{Object.values(columns).filter(col => !col.hidden).map(col => <option value={col.id} key={col.table+col.name}>
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
			<button style={{ marginLeft: '1em', padding: '0 8px 0 8px', borderRadius: '8px' }} onClick={destruct}>remove</button>
		</div>
	);
}

function ColumnsSelector() {
	const { settings: { enabledColumns }, set } = useContext(SettingsContext);
	const { columns: columnsMap } = useContext(TableContext);
	const columns = Object.values(columnsMap);
	const tables = [...new Set(columns.filter(col => !col.hidden).map(c => c.table as string))];
	const sortFn = (a: string, b: string) => Object.keys(columnsMap).indexOf(a) - Object.keys(columnsMap).indexOf(b);
	const columnChecks = columns.filter(col => !col.hidden).map(col => [col,
		<MenuCheckbox key={col.id} text={col.name} value={enabledColumns.includes(col.id)} disabled={col.id === 'time'}
			callback={checked => set('enabledColumns', (cols) => [...cols.filter(c => c !== col.id), ...(checked ? [col.id] : [])].sort(sortFn))}/>] as [ColumnDef, any]);
	return (
		<div className='ColumnsSelector'>
			{tables.map(table => <Fragment key={table}>
				<b key={table} style={{ marginBottom: '4px', maxWidth: '10em' }}>
					<MenuCheckbox text={prettyName(table)} hide={true} value={!!enabledColumns.find(id => id !== 'time' && columnsMap[id]?.table === table)}
						callback={chck => set('enabledColumns', (cols) => [
							...cols.filter(c => chck || c === 'time' || columnsMap[c].table !== table),
							...(chck ? columns.filter(c => c.table === table && c.id !== 'time').map(c => c.id) : [])].sort(sortFn))}/>
				</b>
				<>{columnChecks.filter(([col,]) => col.table === table).map(([col, el]) => el)}</>
			</Fragment>)}
		</div>
	);
}

function MenuInput(props: any) { //onChange={e => props.onChange?.(e.target.value)} 
	return <input style={{ width: '4em', margin: '0 4px 0 4px', ...props.style }} {...props} 
		onClick={e => e.stopPropagation()}/>;
}

function MenuCheckbox({ text, value, callback, hide, disabled }:
{ text: string, value: boolean, hide?: boolean, callback: (v: boolean) => void, disabled?: boolean }) {
	return (<label onClick={e => e.stopPropagation()} className='MenuInput'>
		{text}
		<input type='checkbox' checked={value} disabled={disabled||false} onChange={e => callback(e.target.checked)} style={{ marginLeft: '8px', display: hide ? 'none' : 'inline-block' }}/>
	</label>);
}

function MenuButton({ text, action, callback }: { text: string, action: string, callback?: () => void }) {
	const keyComb = KEY_COMB[action]?.split('%');
	return (
		<button className='MenuItem' onClick={() => dispatchCustomEvent('action+' + action)}>
			<span>{text}</span>
			{keyComb && <span className='keyComb'>{keyComb[1] || keyComb[0]}</span>}
		</button>
	);
}

function SettingsSelect<T extends keyof Settings>({ what, options, allowEmpty=true }: { what: T, options: readonly (Settings[T])[], allowEmpty?: boolean }) {
	const { settings, set } = useContext(SettingsContext);

	return (
		<span>
			{what}:
			<select style={{ paddingLeft: '8px', margin: '0 4px 0 4px', ...(!settings[what] && { color: 'var(--color-text-dark)' }) }}
				value={settings[what] as any || '--none'} onClick={e => e.stopPropagation()}
				onChange={(e) => set(what, () => e.target.value === '--none' ? undefined : e.target.value as any)}> 
				{/* set(what, () => e.target.value as any)}> */}
				{allowEmpty && <option value='--none'>-- None --</option>}
				{options.map((opt: any) => <option key={opt} value={opt}>{opt}</option>)}
			</select>
		</span>
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
	const action = Object.keys(KEY_COMB).find(k => KEY_COMB[k].split('%')[0] === keycomb);
	if (action) {
		e.preventDefault();
		dispatchCustomEvent('action+' + action);
	}
}

export function Menu({ filters, setFilters }: FilterArgs) {
	const { settings, set } = useContext(SettingsContext);
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
					<MenuButton text='Plot selected' action='plot'/>
					<MenuButton text='Plot previous' action='plotPrev'/>
					<MenuButton text='Plot next' action='plotNext'/>
					<MenuButton text='Reset settings' action='resetSettings'/>
				</MenuSection>
				<MenuSection name='Export' {...{ shownSection, setShownSection }}>
					<ExportMenu/>
				</MenuSection>
				<MenuSection name='Plot' {...{ shownSection, setShownSection }}>
					<h4>Select plots</h4>
					<SettingsSelect what='plotTop' options={plotTypes}/>
					<SettingsSelect what='plotLeft' options={plotTypes}/>
					<SettingsSelect what='plotBottom' options={plotTypes}/>
					<div>
					bottom plot height (%)
						<MenuInput type='number' min='20' max='70' step='5' value={settings.plotBottomSize || 40}
							onChange={(e: any) => set('plotBottomSize', () => e.target.valueAsNumber)}/>
					</div>
					<div>
					right plots width (%)
						<MenuInput type='number' min='30' max='90' step='5' value={settings.plotsRightSize || 50}
							onChange={(e: any) => set('plotsRightSize', () => e.target.valueAsNumber)}/>
					</div>
					<h4>Options</h4>
					<div>
						± Days:
						<MenuInput type='number' min='-5' max='-1' step='1' value={settings.plotTimeOffset[0]}
							onChange={(e: any) => set('plotTimeOffset', (prev) => [e.target.valueAsNumber, prev[1]])}/>
						/
						<MenuInput type='number' min='1' max='9' step='1' value={settings.plotTimeOffset[1]}
							onChange={(e: any) => set('plotTimeOffset', (prev) => [prev[0], e.target.valueAsNumber])}/>
					</div>
					<h4>Cosmic Rays</h4>
					<MenuCheckbox text='Show Az component' value={!!settings.plotAz} callback={v => set('plotAz', () => v)}/>
					{/* <MenuCheckbox text='Show geomagnetism' value={!!settings.plotAz} callback={v => set('plotAz', () => v)}/> */}
					<h4>Solar Wind</h4>
					<MenuCheckbox text='Show IMF components' value={!!settings.plotImfVector} callback={v => set('plotImfVector', () => v)}/>
					{/* <MenuCheckbox text='Show plasma plot' value={!!settings.plotAz} callback={v => set('plotAz', () => v)}/> */}

				</MenuSection>
			</div>
			{showColumns && <ColumnsSelector/>}
			{filters.length > 0 && <div className='Filters'>
				{ filters.map(filter => <FilterCard key={filter.id} {...{ filter, setFilters }}/>) }
			</div>}
		</div>
	);
}