import { QueryClient, QueryClientProvider, useQueryClient } from 'react-query';
import { useEffect, useState } from 'react';
import { PlotCirclesStandalone } from './plots/time/Circles';
import './styles/index.css';
import Help from './Help';
import PlotGSM from './plots/time/GSM';
import TemperatureApp from './data/muon/Temperature';
import Neutron from './data/neutron/Neutron';
import MuonApp from './data/muon/Muon';
import OmniApp from './data/omni/Omni';
import { AuthWrapper } from './Auth';
import EventsApp from './events/EventsApp';
import { dispatchCustomEvent, useEventListener } from './util';
import { closeContextMenu, handleGlobalKeydown, openContextMenu, showError, themeOptions, useAppSettings, useContextMenu } from './app';
import { LayoutContextMenu, resetLayouts } from './Layout';

const theQueryClient = new QueryClient();

function ContextMenu() {
	const queryClient = useQueryClient();
	const { menu } = useContextMenu();
	const [ div, setDiv ] = useState<HTMLDivElement|null>(null);
	
	return !menu ? null : <div ref={setDiv} className='ContextMenu'
		style={{ left: Math.min(menu.x, document.body.offsetWidth - (div?.offsetWidth ?? 260)),
				 top: Math.min(menu.y, document.body.offsetHeight - (div?.offsetHeight ?? 260)) }}
		onClick={e => { if (!(e.target instanceof HTMLButtonElement)) e.stopPropagation(); }}>
		{menu.type === 'app' && <>
			<button onClick={() => queryClient.refetchQueries()}>Refetch all</button>
			<button onClick={() => resetLayouts()}>Reset layouts</button>
			<button onClick={() => dispatchCustomEvent('resetSettings')}>Reset all settings</button>
		</>}
		{menu.type === 'layout' && <LayoutContextMenu {...menu.detail as any}/>}
	</div>;
}

function App() {
	const { error, theme, setTheme } = useAppSettings();
	const commonApps = ['feid', 'meteo', 'muon', 'neutron', 'omni'];
	const apps = [...commonApps, 'ros', 'help', 'test'];
	const app = apps.find(a => window.location.pathname.endsWith(a)) ?? 'none';
	useEffect(() => {
		document.title = {
			meteo: 'Crow: meteo',
			neutron: 'CREAM: NM',
			muon: 'CREAM: MT',
			omni: 'Crow: Omni',
			ros: 'RoS',
			help: 'Manual',
			feid: 'FEID',
			test: 'test',
			none: 'Swan & Crow'
		}[app]!;
	}, [app]);

	// TODO: reset settings

	useEventListener('action+switchTheme', () => 
		setTheme(themeOptions[(themeOptions.indexOf(theme) + 1) % themeOptions.length]));
	document.documentElement.setAttribute('main-theme', theme);

	useEventListener('click', closeContextMenu);
	useEventListener('contextmenu', (e: PointerEvent) => { e.preventDefault(); closeContextMenu(); });
	useEventListener('keydown', handleGlobalKeydown);

	if (app === 'none')
		return <div style={{ margin: '2em 3em', lineHeight: '2em', fontSize: 20 }}>
			<h4>Select an application:</h4>
			- <a href='feid'>Forbush Effects and Interplanetary Disturbances catalogue</a><br/>
			- <a href='ros'>Ring of Stations method</a><br/>
			- <a href='meteo'>Atmospheric temperature</a><br/>
			- <a href='neutron'>Neutron monitors</a><br/>
			- <a href='muon'>Muon telescopes</a><br/>
			- <a href='omni'>Interplanetary medium (omni)</a>
		</div>;

	if (app === 'test')
		return <div style={{ width: 800, marginLeft: 20, height: 600, position: 'relative' }}>
			<PlotGSM params={{
				showAxy: true, showAxyVector: true,
				subtractTrend: true, showAz: true, maskGLE: true, useA0m: true,
				interval: [new Date('2023-04-23 08:00'), new Date('2023-04-26T10:00:00')],
				onsets: [ { time: new Date('2023-04-23T17:38:00Z'), type: 'SSC' } ],
				clouds: [{ start: new Date('2023-04-24T01:00:00Z'), end: new Date('2023-04-25T19:00:00Z') }],
				showGrid: true, showLegend: true, showMarkers: true, showMetaInfo: true, showTimeAxis: true }}/>
		</div>;

	const borderDef = '1px var(--color-border) solid';
	const showNav = !['ros', 'help'].includes(app);
	return (<div className='bbox' style={{ overflow: 'clip' }}>
		<div className='bbox' style={{ height: `calc(100vh - ${showNav ? 24 : 0}px)`, width: '100vw', padding: '4px 4px 2px 4px' }}>
			{app === 'ros' && <PlotCirclesStandalone/>}
			{app === 'feid' && <EventsApp/>}
			{app === 'help' && <Help/>}
			{app === 'meteo' && <TemperatureApp/>}
			{app === 'neutron' && <Neutron/>}
			{app === 'muon' && <MuonApp/>}
			{app === 'omni' && <OmniApp/>}
		</div>
		<ContextMenu/>
		{showNav && <div style={{ height: 24, fontSize: 14, padding: 2, userSelect: 'none', display: 'flex', gap: 8, justifyContent: 'space-between',
			 	color: 'var(--color-text-dark)', borderTop: borderDef }} onContextMenu={openContextMenu('app')}>
			<select style={{ border: 'none', padding: 0, borderRight: borderDef }} value={app} onChange={e => { window.location.href = e.target.value; }}>
				{commonApps.map(a => <option key={a} value={a}>/{a}</option>)}
			</select>
			{error && <div style={{ color: 'var(--color-red)', textAlign: 'left', flex: 1 }} onClick={() => showError(null)}>{error}</div>}
			<div title='Application colors scheme' style={{ borderLeft: borderDef }}>
				<select style={{ width: theme.length+4+'ch', border: 'none', padding: 0 }} value={theme} onChange={(e) => setTheme(e.target.value as any)}>
					{themeOptions.map(th => <option key={th} value={th}>{th}</option>)}
				</select>
			</div>
		</div>}
	</div>);
}

export default function AppWrapper() {
	return (
		<QueryClientProvider client={theQueryClient}>
			<AuthWrapper>
				<App/>
			</AuthWrapper>
		</QueryClientProvider>
	);
}