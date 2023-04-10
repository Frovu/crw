import { useState, useContext, Fragment, ReactNode, useMemo, CSSProperties } from 'react';
import { TableContext, DataContext, SettingsContext, Settings, plotTypes, prettyTable, themeOptions } from './Table';
import { useEventListener, dispatchCustomEvent, useMutationHandler } from '../util';
import { CorrelationMenu, HistogramMenu } from './Statistics';
import { AuthButton, AuthContext } from '../App';
import { GenericsSelector } from './Generics';
import { SampleMenu } from './Sample';

export const KEY_COMB = {
	'openColumnsSelector': 'C',
	'openGenericsSelector': 'G',
	'addFilter': 'F',
	'removeFilter': 'R',
	'plot': 'P',
	'plotPrev': 'BracketLeft%[',
	'plotNext': 'BracketRight%]',
	'switchViewPlots': 'H',
	'switchHistCorr': 'J',
	'switchTheme': 'T',
	'commitChanges': 'Ctrl+S',
	'discardChanges': 'Ctrl+X'
} as { [action: string]: string };

function MutationButton({ text, fn, invalidate }: { text: string, fn: () => Promise<any>, invalidate?: any }) {
	const { isLoading, report, mutate, color } = useMutationHandler(fn, invalidate);
	return (
		<button className='MenuItem' onClick={e => {e.stopPropagation(); mutate(null);}}>
			<span style={{ textAlign: 'center', width: text.length+'ch', color }}>
				{report && (report.error ?? report.success)}
				{!report && (isLoading ? '...' : text)}
			</span>
		</button>
	);
}

function AdminMenu() {
	const { promptLogin } = useContext(AuthContext);
	const wrapFetch = (uri: string) => async () => {
		const res = await fetch(`${process.env.REACT_APP_API}${uri}`, {
			method: 'POST', credentials: 'include' });
		if (res.status !== 200)
			throw new Error('HTTP '+res.status);
		return await res.text();
	};
	const computeGenerics = wrapFetch('api/events/recompute_generics');
	const computeOther = wrapFetch('api/events/recompute_other');
	return (
		<>
			<MutationButton text='Recompute generics' fn={computeGenerics} invalidate={['tableData']}/>
			<MutationButton text='Recompute other' fn={computeOther} invalidate={['tableData']}/>
			<button className='MenuItem' onClick={() => promptLogin('upsert')}>Upsert user</button>
		</>
	);

}

function ColumnsSelector() {
	const { settings: { enabledColumns }, set } = useContext(SettingsContext);
	const { columns: allColumns, tables } = useContext(TableContext);
	const columns = allColumns.filter(c => !c.hidden);
	const columnCount = Math.min(4, Math.floor(document.body.offsetWidth / 200));
	const rowCount = Math.ceil((columns.length + tables.length) / columnCount) + 1;
	return (<>
		<div className='PopupBackground' style={{ opacity: .5 }}></div>
		<div className='ColumnsSelector Popup' style={{ gridTemplateRows: `repeat(${rowCount}, auto)` }}>
			{tables.map(table => <Fragment key={table}>
				<b key={table} style={{ marginRight: '8px', maxWidth: '16ch', gridRow: table.length > 16 ? 'span 2' : 'unset' }}>
					<MenuCheckbox text={prettyTable(table)} hide={true}
						value={!!enabledColumns.find(id => id !== 'time' && columns.find(cc => cc.id === id)?.table === table)}
						callback={chck => set('enabledColumns', (cols) => [
							...cols.filter(c => chck || c === 'time' || columns.find(cc => cc.id === c)?.table !== table),
							...(chck ? columns.filter(c => c.table === table).map(c => c.id) : [])])}/>
				</b>
				{columns.filter(c => c.table === table).map(col =>
					<MenuCheckbox key={col.id} text={col.name} title={col.description}
						value={enabledColumns.includes(col.id)} left={true}
						callback={checked => set('enabledColumns', (cols) => [...cols.filter(c => c !== col.id), ...(checked ? [col.id] : [])])}/>)}
			</Fragment>)}
		</div>
	</>);
}

export function MenuInput(props: any) {
	return (<span>
		{props.text ? props.text+':' : ''}
		<input style={{ width: '4em', margin: '0 4px 0 4px', ...props.style }} {...props} 
			onClick={e => e.stopPropagation()} onChange={(e) => props.onChange?.(props.type === 'number' ? e.target.valueAsNumber : e.target.value)}/>
	</span>);
}

export function MenuCheckbox({ text, value, callback, hide, disabled, title, left }:
{ text: string, title?: string, value: boolean, hide?: boolean, callback: (v: boolean) => void, disabled?: boolean, left?: boolean }) {
	return (<label title={title} onClick={e => e.stopPropagation()} className='MenuInput'>
		{!left && text}
		<input type='checkbox' checked={value} disabled={disabled||false} onChange={e => callback(e.target.checked)}
			style={{ ['margin' + (left ? 'Right' : 'Left')]: '8px', display: hide ? 'none' : 'inline-block' }}/>
		{left && text}
	</label>);
}

export function MenuButton({ text, action, disabled }: { text: string, action: string, disabled?: boolean }) {
	const keyComb = KEY_COMB[action]?.split('%');
	return (
		<button className='MenuItem' style={{ borderColor: 'transparent' }} disabled={disabled} onClick={() => dispatchCustomEvent('action+' + action)}>
			<span>{text}</span>
			{keyComb && <span className='keyComb'>{keyComb[1] || keyComb[0]}</span>}
		</button>
	);
}

export function MenuSelect({ text, value, options, pretty, callback, width, withNull }:
{ text: string, value: string | null, width?: string, withNull?: boolean, options: readonly (string|null)[], pretty?: string[], callback: (val: string | null) => void}) {
	return (
		<span>
			{text}:
			<select style={{ paddingLeft: '8px', margin: '0 4px 0 4px', ...(width && { width }), ...(!value && { color: 'var(--color-text-dark)' }) }}
				value={value || '--none'} onClick={e => e.stopPropagation()}
				onChange={(e) => callback(e.target.value === '--none' ? null : e.target.value)}> 
				{(withNull?[null as any]:[]).concat(options).map((opt, i) => opt == null ?
					<option key='--none' value='--none'>-- None --</option> :
					<option key={opt} value={opt}>{pretty?.[withNull ? i-1 : i] ?? opt}</option>)}
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

function MenuSection({ name, shownSection, setShownSection, children, style }:
{ name: string, shownSection: string | null, setShownSection: (s: string | null) => void, children: ReactNode, style?: CSSProperties }) {
	return (
		<div>
			<button onClick={e => {setShownSection(name); e.stopPropagation(); }}>
				{name}
			</button>
			{name === shownSection && <div className='MenuDropdown' style={style} onClick={e => { e.stopPropagation(); }}>
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
		const data = (filtered ? fData : rData).map(row => row.slice(1));
		const columns = filtered ? fColumns : rColumns.slice(1);
		if (!format)
			return URL.createObjectURL(new Blob([JSON.stringify({
				columns: columns.map(({ fullName, type, description, enum: aenum }) => ({ name: fullName, type, description, enum: aenum })), data }, null, 2)],{ type: 'application/json' }));

		let text = 'Note: plaintext export option has limitations and you should consider using JSON instead\r\nAll whitespace in values are replaced by _, missing values are marked as N/A\r\n';
		text += columns.map(col => col.id.padStart(col.width, ' '.repeat(col.width))).join(' ') + '\r\n';

		for (const row of data) {
			for (const [i, col] of columns.entries()) {
				const v = row[i];
				const val = col.type === 'time' ? v?.toISOString().replace(/\..+/,'Z') : v;
				text += (val == null ? 'N/A' : val).toString().replace(/\s/, '_').padStart(col.width + (i === 0 ? 0 : 4), ' '.repeat(col.width)) + ' ';
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

export function Menu() {
	const { changes } = useContext(TableContext);
	const { settings, set } = useContext(SettingsContext);
	const { role } = useContext(AuthContext);
	const [showColumns, setShowColumns] = useState(false);
	const [showGenerics, setShowGenerics] = useState(false);
	const [shownSection, setShownSection] = useState<string | null>(null);

	const hideEverything = () => {
		setShowColumns(false);
		setShowGenerics(false);
		setShownSection(null);
	};
	useEventListener('escape', hideEverything);
	useEventListener('click', hideEverything);

	useEventListener('action+openColumnsSelector', () => {hideEverything(); setShowColumns(!showColumns);});
	useEventListener('action+openGenericsSelector', () => {hideEverything(); setShowGenerics(!showGenerics);});
	useEventListener('keydown', onKeydown);
	return (
		<div>
			<div className='Menu'>
				<MenuSection name='Table' {...{ shownSection, setShownSection }}>
					<MenuButton text='Add filter' action='addFilter'/>
					<MenuButton text='Remove filter' action='removeFilter'/>
					<MenuButton text='Select columns' action='openColumnsSelector'/>
					<MenuButton text='Edit generics' action='openGenericsSelector'/>
					<MenuButton text='Plot selected' action='plot'/>
					<MenuButton text='Plot previous' action='plotPrev'/>
					<MenuButton text='Plot next' action='plotNext'/>
					<MenuButton text='Switch view' action='switchViewPlots'/>
					<MenuButton text='Switch theme' action='switchTheme'/>
					<MenuCheckbox text='Compute averages' value={!!settings.computeAverages} callback={v => set('computeAverages', () => v)}/>
					<MenuCheckbox text='Show row changes' value={!!settings.showChangelog} callback={v => set('showChangelog', () => v)}/>
					<MenuButton text='Reset settings' action='resetSettings'/>
					<a style={{ textAlign: 'center' }} href='./help' target='_blank' >Open manual</a>
					<AuthButton/>
					{role === 'admin' && <AdminMenu/>}
					<MenuButton text='Commit changes' disabled={!changes.length} action='commitChanges'/>
					<MenuButton text='Discard changes' disabled={!changes.length} action='discardChanges'/>
				</MenuSection>
				<MenuSection name='Sample' style={{ left: 0 }} {...{ shownSection, setShownSection }}>
					<SampleMenu/>
				</MenuSection>
				<MenuSection name='Export' style={{ left: '4em' }} {...{ shownSection, setShownSection }}>
					<h4 style={{ textAlign: 'right' }}>Export table</h4>
					<ExportMenu/>
				</MenuSection>
				<MenuSection name='Plot' style={{ left: '4em', minWidth: '19em' }} {...{ shownSection, setShownSection }}>
					<h4>Select plots</h4>
					<SettingsSelect what='plotLeft' options={plotTypes}/>
					<SettingsSelect what='plotTop' options={plotTypes}/>
					<SettingsSelect what='plotBottom' options={plotTypes}/>
					<MenuInput text='bottom plot height (%)' type='number' min='20' max='70' step='5' value={settings.plotBottomSize || 40}
						onChange={(v: any) => set('plotBottomSize', () => v)}/>
					<MenuInput text='right plots width (%)' type='number' min='30' max='90' step='5' value={settings.plotsRightSize || 50}
						onChange={(v: any) => set('plotsRightSize', () => v)}/>
					<h4>Options</h4>
					<SettingsSelect what='theme' options={themeOptions}/>
					<MenuCheckbox text='Show markers' value={!!settings.plotMarkers} callback={v => set('plotMarkers', () => v)}/>
					<MenuCheckbox text='Show grid' value={!!settings.plotGrid} callback={v => set('plotGrid', () => v)}/>
					<MenuCheckbox text='Show legend' value={!!settings.plotLegend} callback={v => set('plotLegend', () => v)}/>
					<div>
						± Days:
						<MenuInput type='number' min='-5' max='-1' step='1' value={settings.plotTimeOffset?.[0]}
							onChange={(v: any) => set('plotTimeOffset', (prev) => [v, prev[1]])}/>
						/
						<MenuInput type='number' min='1' max='9' step='1' value={settings.plotTimeOffset?.[1]}
							onChange={(v: any) => set('plotTimeOffset', (prev) => [prev[0], v])}/>
					</div>
					<h4>Cosmic Rays</h4>
					<MenuCheckbox text='Show Az' value={!!settings.plotAz} callback={v => set('plotAz', () => v)}/>
					<MenuCheckbox text='Subtract variation trend' value={!!settings.plotSubtractTrend} callback={v => set('plotSubtractTrend', () => v)}/>
					<MenuCheckbox text='Mask GLE' value={!!settings.plotMaskGLE} callback={v => set('plotMaskGLE', () => v)}/>
					<MenuCheckbox text='Use dst corrected A0m' value={!!settings.plotUseA0m} callback={v => set('plotUseA0m', () => v)}/>
					<MenuCheckbox text={'Use index: ' + (settings.plotIndexAp ? 'Ap' : 'Kp')} hide={true} value={!!settings.plotIndexAp} callback={v => set('plotIndexAp', () => v)}/>
					<h4>Solar Wind</h4>
					<MenuCheckbox text={'Temperature: ' + (settings.plotTempIdx ? 'index' : 'plain')} hide={true} value={!!settings.plotTempIdx} callback={v => set('plotTempIdx', () => v)}/>
					<MenuCheckbox text='Show IMF Bz' value={!!settings.plotImfBz} callback={v => set('plotImfBz', () => v)}/>
					<MenuCheckbox text='Show IMF Bx,By' value={!!settings.plotImfBxBy} callback={v => set('plotImfBxBy', () => v)}/>
				</MenuSection>
				<MenuSection name='Statistics' style={{ left: '4em', minWidth: '19em' }} {...{ shownSection, setShownSection }}>
					<h4>Histogram</h4>
					<HistogramMenu/>
					<CorrelationMenu/>
				</MenuSection>
			</div>
			{showColumns && <ColumnsSelector/>}
			{showGenerics && <GenericsSelector/>}
		</div>
	);
}

function onKeydown(e: KeyboardEvent) {
	if (e.code === 'Escape')
		return dispatchCustomEvent('escape');
	if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)
		return;
	const keycomb = (e.ctrlKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + e.code.replace(/Key|Digit/, '');
	const action = Object.keys(KEY_COMB).find(k => KEY_COMB[k].split('%')[0] === keycomb);
	if (action) {
		e.preventDefault();
		dispatchCustomEvent('action+' + action);
	}
}

export function ConfirmationPopup({ text, confirm, close, children, style, persistent }:
{ text?: string, children?: ReactNode, style?: CSSProperties, persistent?: boolean, confirm: () => void, close: () => void }) {
	useEventListener('click', close);
	useEventListener('keydown', (e) => {
		if (!persistent)
			close();
		if (e.code === 'KeyY')
			confirm();
	});

	return (<>
		<div className='PopupBackground'></div>
		<div className='Popup' style={{ left: '30vw', top: '20vh', width: '20em', ...style }}>
			{!children && <h4>Confirm action</h4>}
			{children ?? <p>{text ?? 'Beware of irreversible consequences'}</p>}
			<div style={{ marginTop: '1em' }}>
				<button style={{ width: '8em' }} onClick={e => {!persistent && close(); confirm(); e.stopPropagation();}}>Confirm (Y)</button>
				<button style={{ width: '8em', marginLeft: '24px' }} onClick={close}>Cancel (N)</button>
			</div>
		</div>
	</>);
}