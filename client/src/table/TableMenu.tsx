import { useState, useContext, Fragment, ReactNode, useMemo } from 'react';
import { TableContext, DataContext, prettyName, SettingsContext, Settings, plotTypes, ColumnDef } from './Table';
import { useEventListener, dispatchCustomEvent } from '../util';
import { HistogramMenu } from './Histogram';

const KEY_COMB = {
	'openColumnsSelector': 'C',
	'addFilter': 'F',
	'removeFilter': 'R',
	'plot': 'P',
	'plotPrev': 'BracketLeft%[',
	'plotNext': 'BracketRight%]',
	'switchViewPlots': 'H',
} as { [action: string]: string };

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
							...cols.filter(c => chck || c === 'time' || columnsMap[c]?.table !== table),
							...(chck ? columns.filter(c => c.table === table && c.id !== 'time').map(c => c.id) : [])].sort(sortFn))}/>
				</b>
				<>{columnChecks.filter(([col,]) => col.table === table).map(([col, el]) => el)}</>
			</Fragment>)}
		</div>
	);
}

export function MenuInput(props: any) {
	return (<span>
		{props.text ? props.text+':' : ''}
		<input style={{ width: '4em', margin: '0 4px 0 4px', ...props.style }} {...props} 
			onClick={e => e.stopPropagation()} onChange={(e) => props.onChange?.(props.type === 'number' ? e.target.valueAsNumber : e.target.value)}/>
	</span>);
}

export function MenuCheckbox({ text, value, callback, hide, disabled }:
{ text: string, value: boolean, hide?: boolean, callback: (v: boolean) => void, disabled?: boolean }) {
	return (<label onClick={e => e.stopPropagation()} className='MenuInput'>
		{text}
		<input type='checkbox' checked={value} disabled={disabled||false} onChange={e => callback(e.target.checked)} style={{ marginLeft: '8px', display: hide ? 'none' : 'inline-block' }}/>
	</label>);
}

export function MenuButton({ text, action }: { text: string, action: string }) {
	const keyComb = KEY_COMB[action]?.split('%');
	return (
		<button className='MenuItem' onClick={() => dispatchCustomEvent('action+' + action)}>
			<span>{text}</span>
			{keyComb && <span className='keyComb'>{keyComb[1] || keyComb[0]}</span>}
		</button>
	);
}

export function MenuSelect({ text, value, options, callback, width }:
{ text: string, value: string | null, width?: string, options: readonly (string|null)[], callback: (val: string | null) => void}) {
	return (
		<span>
			{text}:
			<select style={{ paddingLeft: '8px', margin: '0 4px 0 4px', ...(width && { width }), ...(!value && { color: 'var(--color-text-dark)' }) }}
				value={value || '--none'} onClick={e => e.stopPropagation()}
				onChange={(e) => callback(e.target.value === '--none' ? null : e.target.value)}> 
				{options.map(opt => opt == null ?
					<option key='--none' value='--none'>-- None --</option> :
					<option key={opt} value={opt}>{opt}</option>)}
			</select>
		</span>
	);
}

export function SettingsSelect<T extends keyof Settings>({ what, options, allowEmpty=true }: { what: T, options: readonly (Settings[T])[], allowEmpty?: boolean }) {
	const { settings, set } = useContext(SettingsContext);

	return (
		<span>
			{what}:
			<select style={{ paddingLeft: '8px', margin: '0 4px 0 4px', ...(!settings[what] && { color: 'var(--color-text-dark)' }) }}
				value={settings[what] as any || '--none'} onClick={e => e.stopPropagation()}
				onChange={(e) => set(what, () => e.target.value === '--none' ? undefined : e.target.value as any)}> 
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

function CorrelationMenu() {
	const { columns } = useContext(TableContext);
	const { options, setOptions } = useContext(SettingsContext);
	const set = (key: any) => (value: any) => setOptions('correlation', opts => ({ ...opts, [key]: value }));

	return (<>
		<h4>Correlation</h4>
		<MenuSelect text='X' value={options.correlation.columnX} width='10em' options={Object.keys(columns)} callback={set('columnX')}/>
		<MenuSelect text='Y' value={options.correlation.columnY} width='10em' options={Object.keys(columns)} callback={set('columnY')}/>
		<MenuSelect text='Color' value={options.correlation.color} width='8em' options={['cyan', 'magenta', 'green', 'acid']} callback={set('color')}/>
		<MenuCheckbox text='Show regression' value={options.correlation.regression} callback={set('regression')}/>
	</>);
}

export function Menu() {
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
				<MenuSection name='Table' {...{ shownSection, setShownSection }}>
					<MenuButton text='Add filter' action='addFilter'/>
					<MenuButton text='Remove filter' action='removeFilter'/>
					<MenuButton text='Select columns' action='openColumnsSelector'/>
					<MenuButton text='Plot selected' action='plot'/>
					<MenuButton text='Plot previous' action='plotPrev'/>
					<MenuButton text='Plot next' action='plotNext'/>
					<MenuButton text='Switch view' action='switchViewPlots'/>
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
					<MenuInput text='bottom plot height (%)' type='number' min='20' max='70' step='5' value={settings.plotBottomSize || 40}
						onChange={(v: any) => set('plotBottomSize', () => v)}/>
					<MenuInput text='right plots width (%)' type='number' min='30' max='90' step='5' value={settings.plotsRightSize || 50}
						onChange={(v: any) => set('plotsRightSize', () => v)}/>
					<h4>Options</h4>
					<div>
						± Days:
						<MenuInput type='number' min='-5' max='-1' step='1' value={settings.plotTimeOffset[0]}
							onChange={(v: any) => set('plotTimeOffset', (prev) => [v, prev[1]])}/>
						/
						<MenuInput type='number' min='1' max='9' step='1' value={settings.plotTimeOffset[1]}
							onChange={(v: any) => set('plotTimeOffset', (prev) => [prev[0], v])}/>
					</div>
					<h4>Cosmic Rays</h4>
					<MenuCheckbox text='Show Az component' value={!!settings.plotAz} callback={v => set('plotAz', () => v)}/>
					<MenuCheckbox text={'Use index: ' + (settings.plotIndexAp ? 'Ap' : 'Kp')} hide={true} value={!!settings.plotIndexAp} callback={v => set('plotIndexAp', () => v)}/>
					<h4>Solar Wind</h4>
					<MenuCheckbox text='Show IMF Bz' value={!!settings.plotImfBz} callback={v => set('plotImfBz', () => v)}/>
					<MenuCheckbox text='Show IMF Bx,By' value={!!settings.plotImfBxBy} callback={v => set('plotImfBxBy', () => v)}/>
				</MenuSection>
				<MenuSection name='Statistics' {...{ shownSection, setShownSection }}>
					<CorrelationMenu/>
					<h4>Histogram</h4>
					<HistogramMenu/>
				</MenuSection>
			</div>
			{showColumns && <ColumnsSelector/>}
		</div>
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