import { useState, useContext, Fragment, ReactNode, CSSProperties } from 'react';
import { TableContext, DataContext, SettingsContext, Settings, plotTypes, prettyTable, themeOptions } from './Table';
import { useEventListener, dispatchCustomEvent, useMutationHandler, apiPost } from '../util';
import { CorrelationMenu, HistogramMenu } from './Statistics';
import { AuthButton, AuthContext } from '../App';
import { GenericsSelector } from './Generics';
import { SampleMenu } from './Sample';
import { useQueryClient } from 'react-query';
import ImportMenu from './Import';

export const KEY_COMB = {
	'openColumnsSelector': 'C',
	'openGenericsSelector': 'G',
	'addFilter': 'F',
	'removeFilter': 'R',
	'exportPlot': 'E',
	'plot': 'P',
	'plotPrev': 'BracketLeft%[',
	'plotNext': 'BracketRight%]',
	'plotPrevShown': 'Comma%<',
	'plotNextShown': 'Period%<',
	'switchViewPlots': 'H',
	'switchHistCorr': 'J',
	'switchTheme': 'T',
	'refetch': 'L',
	'commitChanges': 'Ctrl+S',
	'discardChanges': 'Ctrl+X'
} as { [action: string]: string };

function MutationButton({ text, fn, invalidate }: { text: string, fn: () => Promise<any>, invalidate?: string[] }) {
	const { isLoading, report, mutate, color } = useMutationHandler(fn, invalidate);
	return (
		<button className='MenuItem' onClick={e => {e.stopPropagation(); mutate(null);}}>
			<span style={{ textAlign: 'center', width: Math.max(text.length, 16)+'ch', color }}>
				{report && (report.error ?? report.success)}
				{!report && (isLoading ? '...' : text)}
			</span>
		</button>
	);
}

function AdminMenu() {
	const { promptLogin } = useContext(AuthContext);
	return (
		<>
			<MutationButton text='Recompute generics' invalidate={['tableData']}
				fn={() => apiPost('api/events/recompute_generics')}/>
			<MutationButton text='Recompute other' invalidate={['tableData']}
				fn={() => apiPost('api/events/recompute_other')}/>
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

export function SettingsSelect<T extends keyof Settings>({ what, options, withNull=true }: { what: T, options: readonly (Settings[T])[], withNull?: boolean }) {
	const { settings, set } = useContext(SettingsContext);
	return (
		<span>
			{what}:
			<select style={{ paddingLeft: '8px', margin: '0 4px 0 4px', ...(!settings[what] && { color: 'var(--color-text-dark)' }) }}
				value={settings[what] as any ?? '--none'} onClick={e => e.stopPropagation()}
				onChange={(e) => set(what, () => e.target.value === '--none' ? null : e.target.value as any)}> 
				{withNull && <option value='--none'>-- None --</option>}
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
	const { data: fData, columns: fColumns, averages } = useContext(DataContext);

	const [filtered, setFiltered] = useState(true);
	const [format, setFormat] = useState(false);
	
	const dataUrl = () => {
		const data = (filtered ? fData : rData).map(row => row.slice(1));
		const columns = filtered ? fColumns : rColumns.slice(1);
		const cols = columns.map(({ fullName, type, description, enum: aenum }, i) => ({
			name: fullName, type, description, enum: aenum,
			...(filtered && averages?.[i] && {
				median: Math.round(averages[i]![0]*1000) / 1000,
				mean: Math.round(averages[i]![1]*1000) / 1000,
				std: Math.round(averages[i]![2]*1000) / 1000,
				sem: Math.round(averages[i]![3]*1000) / 1000,
			})
		}));
		
		if (!format) {
			return URL.createObjectURL(new Blob([JSON.stringify({
				columns: cols,
				data
			}, null, 2)],
			{ type: 'application/json' }));
		}

		let text = 'Note: plaintext export option has limitations (i.e. does not incldue mean,std,etc) and one should consider using JSON instead\r\nAll whitespace in values is replaced by _, missing values are marked as N/A\r\n';
		text += columns.map(col => col.id.padStart(col.width, ' '.repeat(col.width))).join(' ') + '\r\n';

		for (const row of data) {
			for (const [i, col] of columns.entries()) {
				const v = row[i];
				const val = v instanceof Date ? v?.toISOString().replace(/\..+/,'Z') : v;
				text += (val == null ? 'N/A' : val).toString().replace(/\s/, '_').padStart(col.width + (i === 0 ? 0 : 4), ' '.repeat(col.width)) + ' ';
			}
			text += '\r\n';
		};
		return URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
	};

	const fname = (filtered ? 'some_' : 'all_') + 'events' + (format ? '.txt' : '.json');
	return (
		<>
			<h4> Export table</h4>
			<MenuCheckbox text={'format: '+(format?'plaintext':'JSON')} value={format} callback={setFormat} hide={true}/>
			<MenuCheckbox text='apply filters' value={filtered} callback={setFiltered}/>
			<button style={{ marginLeft: '.5em' }} onClick={() => {
				const a = document.createElement('a');
				a.href = dataUrl();
				a.download = fname;
				a.click();
			}}>Download a file</button>
		</>
	);
}

let settingPlot: undefined | 'plotLeft'|'plotTop'|'plotBottom'; // meh
export function Menu() {
	const queryClient = useQueryClient();
	const { changes } = useContext(TableContext);
	const { settings, set } = useContext(SettingsContext);
	const { role } = useContext(AuthContext);
	const [shownPopup, setShownPopup] = useState<'columns'|'generics'|'import'|null>(null);
	const [shownSection, setShownSection] = useState<string | null>(null);

	const hideEverything = () => {
		setShownPopup(null);
		setShownSection(null);
	};
	const togglePopup = (s: typeof shownPopup) => {
		hideEverything();
		setShownPopup(shownPopup === s ? null : s);
	};

	useEventListener('escape', hideEverything);
	useEventListener('click', hideEverything);

	useEventListener('action+refetch', () => queryClient.refetchQueries());

	useEventListener('action+openImportMenu', () => togglePopup('import'));
	useEventListener('action+openColumnsSelector', () => togglePopup('columns'));
	useEventListener('action+openGenericsSelector', () => togglePopup('generics'));

	useEventListener('keydown', (e: KeyboardEvent) => {
		if (e.code === 'Escape')
			return dispatchCustomEvent('escape');
		if ((e.target instanceof HTMLInputElement && e.target.type !== 'checkbox') || e.target instanceof HTMLSelectElement)
			return;

		const moveH = { ArrowLeft: 1, ArrowRight: -1 }[e.code], moveV = { ArrowUp: 1, ArrowDown: -1 }[e.code];
		if (e.ctrlKey && (moveH || moveV)) {
			if (moveH)
				set('plotsRightSize', val => Math.max(30, Math.min(val + moveH * 5, 80)));
			if (moveV)
				set('plotBottomSize', val => Math.max(20, Math.min(val + moveV * 5, 80)));
			e.stopImmediatePropagation();
		}
	
		if (settingPlot) {
			e.stopImmediatePropagation();
			const number = e.code.replace('Digit', '');
			if (/[0-9]/.test(number))
				set(settingPlot, number !== '0' ? plotTypes[parseInt(number) - 1] : null);
			settingPlot = undefined;
			return e.preventDefault();;
		} else {
			if (e.ctrlKey)
				settingPlot = ({ Digit1: 'plotTop', Digit2: 'plotBottom', Digit3: 'plotLeft' } as const)[e.code];
			if (settingPlot) {
				e.stopImmediatePropagation();
				return e.preventDefault();
			}
		}
	
		const keycomb = (e.ctrlKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + e.code.replace(/Key|Digit/, '');
		const action = Object.keys(KEY_COMB).find(k => KEY_COMB[k].split('%')[0] === keycomb);
		if (action) {
			e.preventDefault();
			dispatchCustomEvent('action+' + action);
		}
	});

	const setPara = <T extends keyof typeof settings.plotParams>(k: T) => (v: typeof settings.plotParams[T]) =>
		set('plotParams', prm => ({ ...prm, [k]: v }));
	const para = settings.plotParams;
	return (
		<div>
			<div className='Menu'>
				<MenuSection name='Table' {...{ shownSection, setShownSection }}>
					<MenuButton text='Add filter' action='addFilter'/>
					<MenuButton text='Remove filter' action='removeFilter'/>
					<MenuButton text='Select columns' action='openColumnsSelector'/>
					<MenuButton text='Edit generics' action='openGenericsSelector'/>
					<MenuButton text='Plot selected' action='plot'/>
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
					<MenuButton text='Export plots' action='exportPlot'/>
					{role === 'admin' && <MenuButton text='Import table' action='openImportMenu'/>}
					<ExportMenu/>
				</MenuSection>
				<MenuSection name='Plot' style={{ left: '4em', minWidth: '19em' }} {...{ shownSection, setShownSection }}>
					<h4>Select plots</h4>
					<SettingsSelect what='plotTop' options={plotTypes}/>
					<SettingsSelect what='plotBottom' options={plotTypes}/>
					<SettingsSelect what='plotLeft' options={plotTypes}/>
					<MenuInput text='bottom plot height (%)' type='number' min='20' max='80' step='5' value={settings.plotBottomSize || 40}
						onChange={(v: any) => set('plotBottomSize', () => v)}/>
					<MenuInput text='right plots width (%)' type='number' min='30' max='80' step='5' value={settings.plotsRightSize || 50}
						onChange={(v: any) => set('plotsRightSize', () => v)}/>
					<h4>Options</h4>
					<SettingsSelect what='theme' options={themeOptions} withNull={false}/>
					<MenuCheckbox text='Show markers' value={!!para.showMarkers} callback={setPara('showMarkers')}/>
					<MenuCheckbox text='Show grid' value={!!para.showGrid} callback={setPara('showGrid')}/>
					<MenuCheckbox text='Show legend' value={!!para.showLegend} callback={setPara('showLegend')}/>
					<div>
						± Days:
						<MenuInput type='number' min='-7' max='0' step='.5' value={settings.plotTimeOffset?.[0]}
							onChange={(v: any) => set('plotTimeOffset', (prev) => isNaN(v) ? prev : [v, prev[1]])}/>
						/
						<MenuInput type='number' min='1' max='14' step='.5' value={settings.plotTimeOffset?.[1]}
							onChange={(v: any) => set('plotTimeOffset', (prev) => isNaN(v) ? prev : [prev[0], v])}/>
					</div>
					<h4>Cosmic Rays</h4>
					<MenuCheckbox text='Show Az' value={para.showAz} callback={setPara('showAz')}/>
					<MenuCheckbox text='Show Axy' value={para.showAxy} callback={setPara('showAxy')}/>
					<MenuCheckbox text='Show vecor' value={para.showAxyVector} callback={setPara('showAxyVector')}/>
					<MenuCheckbox text='Subtract variation trend' value={para.subtractTrend} callback={setPara('subtractTrend')}/>
					<MenuCheckbox text='Mask GLE' value={para.maskGLE} callback={setPara('maskGLE')}/>
					<MenuCheckbox text='Use dst corrected A0m' value={para.useA0m} callback={setPara('useA0m')}/>
					<MenuCheckbox text={'Use index: ' + (para.useAp ? 'Ap' : 'Kp')} hide={true} value={!!para.useAp} callback={setPara('useAp')}/>
					<h4>Solar Wind</h4>
					<MenuCheckbox text={'Temperature: ' + (para.useTemperatureIndex ? 'index' : 'plain')} hide={true}
						value={para.useTemperatureIndex} callback={setPara('useTemperatureIndex')}/>
					<MenuCheckbox text='Show IMF Bz' value={para.showBz} callback={setPara('showBz')}/>
					<MenuCheckbox text='Show IMF Bx,By' value={para.showBxBy} callback={setPara('showBxBy')}/>
					<MenuCheckbox text='Show beta' value={para.showBeta} callback={setPara('showBeta')}/>

				</MenuSection>
				<MenuSection name='Statistics' style={{ left: '4em', minWidth: '19em' }} {...{ shownSection, setShownSection }}>
					<h4>Histogram</h4>
					<HistogramMenu/>
					<CorrelationMenu/>
				</MenuSection>
			</div>
			{shownPopup === 'import' && <ImportMenu/>}
			{shownPopup === 'columns' && <ColumnsSelector/>}
			{shownPopup === 'generics' && <GenericsSelector/>}
		</div>
	);
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