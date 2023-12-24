import { QueryClient, QueryClientProvider } from 'react-query';
import { useEffect, useState } from 'react';
import { PlotCirclesStandalone } from './plots/time/Circles';
import './styles/index.css';
import './styles/App.css';
import Help from './Help';
import PlotGSM from './plots/time/GSM';
import TemperatureApp from './data/muon/Temperature';
import Neutron from './data/neutron/Neutron';
import MuonApp from './data/muon/Muon';
import OmniApp from './data/omni/Omni';
import { AuthNav, AuthWrapper } from './Auth';
import EventsApp from './events/EventsApp';
import { useEventListener } from './util';
import { closeContextMenu, handleGlobalKeydown, openContextMenu, themeOptions, useAppSettings, logColor } from './app';
import { LayoutNav } from './Layout';
import ContextMenu from './ContextMenu';

const theQueryClient = new QueryClient();

function Logs() {
	const { log } = useAppSettings();
	const [hover, setHover] = useState(false);
	const [expand, setExpand] = useState(false);
	const [show, setShow] = useState(true);
	const last = log.at(-1);

	useEffect(() => {
		setShow(true);
		const interval = setInterval(() => setShow(false),
			['error', 'success'].includes(last?.type as any) ? 20000 : 5000);
		return () => clearInterval(interval);
	}, [last]);

	useEventListener('mousedown', () => setExpand(false));
	useEventListener('contextmenu', () => setExpand(false));

	return <div style={{ flex: 1, maxWidth: '25em', position: 'relative' }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
		{!expand && hover && <button className='TextButton' style={{ width: '100%' }}
			onClick={() => setExpand(s => !s)}>show logs</button>}
		{!expand && !hover && last && show && <div style={{ paddingLeft: 4,
			color: last.type === 'info' ? 'var(--color-text-dark)' : logColor[last.type],
			textOverflow: '".."', overflow: 'hidden', whiteSpace: 'nowrap' }}>{last.text}</div>}
		{expand && <div style={{ position: 'absolute', width: '100%', minHeight: 120, left: 0, bottom: 0, display: 'flex', flexDirection: 'column-reverse',
			maxHeight: '20em', backgroundColor: 'var(--color-bg)', padding: 2, border: '1px var(--color-border) solid', overflow: 'auto' }}>
			{[...log].reverse().map(({ time, text, type }) => <div key={time.getTime() + text} style={{ color: logColor[type] }}>
				<span style={{ fontSize: 12, color: 'var(--color-text)' }}>{time.toLocaleTimeString('en-gb')}:</span> {text}
			</div>)}
		</div>}
	</div>;
}

function App() {
	const { theme, setTheme } = useAppSettings();
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

	useEventListener('action+switchTheme', () => 
		setTheme(themeOptions[(themeOptions.indexOf(theme) + 1) % themeOptions.length]));
	document.documentElement.setAttribute('main-theme', theme);

	useEventListener('escape', closeContextMenu);
	useEventListener('mousedown', closeContextMenu);
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
				showAxy: true, showAxyVector: true, showMetaLabels: true,
				subtractTrend: true, showAz: true, maskGLE: true, useA0m: true,
				interval: [new Date('2023-04-23 08:00'), new Date('2023-04-26T10:00:00')],
				onsets: [ { time: new Date('2023-04-23T17:38:00Z'), type: 'SSC' } ],
				clouds: [{ start: new Date('2023-04-24T01:00:00Z'), end: new Date('2023-04-25T19:00:00Z') }],
				showGrid: true, showLegend: true, showMarkers: true, showMetaInfo: true, showTimeAxis: true }}/>
		</div>;

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
		{app !== 'feid' && <ContextMenu/>}
		{showNav && <div className='AppNav' onContextMenu={openContextMenu('app')}>
			<div>
				<select value={app} onChange={e => { window.location.href = e.target.value; }}>
					{commonApps.map(a => <option key={a} value={a}>/{a}</option>)}
				</select>
			</div>
			<AuthNav/>
			{app === 'feid' && <LayoutNav/>}
			<div style={{ flex: 1 }}/>
			<Logs/>
			<div title='Application colors scheme'>
				<select style={{ width: theme.length+4+'ch' }} value={theme} onChange={(e) => setTheme(e.target.value as any)}>
					{themeOptions.map(th => <option key={th} value={th}>{th}</option>)}
				</select>
			</div>
		</div>}
	</div>);
}

export default function AppWrapper() {
	const { renderColors } = useAppSettings();
	return <div style={{ ...renderColors(), color: 'var(--color-text)', background: 'var(--color-bg)' }}>
		<QueryClientProvider client={theQueryClient}>
			<AuthWrapper>
				<App/>
			</AuthWrapper>
		</QueryClientProvider>
	</div>;
}