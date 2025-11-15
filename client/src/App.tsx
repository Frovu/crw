import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PlotCirclesStandalone } from './plots/time/Circles';
import './styles/index.css';
import './styles/App.css';
import Info from './Info';
import TemperatureApp from './data/muon/Temperature';
import Neutron from './data/neutron/Neutron';
import MuonApp from './data/muon/Muon';
import OmniApp from './data/omni/Omni';
import { AuthNav, AuthWrapper } from './Auth';
import EventsApp from './events/EventsApp';
import { useEventListener } from './util';
import {
	closeContextMenu,
	handleGlobalKeydown,
	openContextMenu,
	themeOptions,
	useAppSettings,
	logColor,
	APPS,
	useContextMenuStore,
	closeConfirmation,
} from './app';
import { LayoutNav } from './Layout';
import ContextMenu from './ContextMenu';
import { CatchErrors, Confirmation } from './Utility';

const theQueryClient = new QueryClient();

// dev tools
// This code is only for TypeScript
declare global {
	interface Window {
		__TANSTACK_QUERY_CLIENT__: import('@tanstack/query-core').QueryClient;
	}
}

// This code is for all users
window.__TANSTACK_QUERY_CLIENT__ = theQueryClient;

function Logs() {
	const { log } = useAppSettings();
	const [hover, setHover] = useState(false);
	const [expand, setExpand] = useState(false);
	const [show, setShow] = useState(true);
	const last = log.findLast((l) => l.type !== 'debug');

	useEffect(() => {
		setShow(true);
		const interval = setInterval(() => setShow(false), ['error', 'success'].includes(last?.type as any) ? 20000 : 5000);
		return () => clearInterval(interval);
	}, [last]);

	useEventListener('mousedown', () => setExpand(false));
	useEventListener('contextmenu', () => setExpand(false));

	return (
		<div
			style={{ flex: 2, maxWidth: '32em', position: 'relative' }}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
		>
			{!expand && hover && (
				<button className="TextButton" style={{ width: '100%' }} onClick={() => setExpand((s) => !s)}>
					show logs
				</button>
			)}
			{!expand && !hover && last && show && (
				<div
					style={{
						paddingLeft: 4,
						color: last.type === 'info' ? 'var(--color-text-dark)' : logColor[last.type],
						textOverflow: '".."',
						overflow: 'hidden',
						whiteSpace: 'nowrap',
					}}
				>
					{last.text}
				</div>
			)}
			{expand && (
				<div
					style={{
						position: 'absolute',
						width: '100%',
						minHeight: 120,
						left: 0,
						bottom: 0,
						display: 'flex',
						flexDirection: 'column-reverse',
						maxHeight: '20em',
						backgroundColor: 'var(--color-bg)',
						padding: 2,
						border: '1px var(--color-border) solid',
						overflow: 'auto',
					}}
				>
					{[...log].reverse().map(({ time, text, type }) => (
						<div key={time.getTime() + text} style={{ color: logColor[type], fontSize: 12 }}>
							<span style={{ color: 'var(--color-text-dark)' }}>{time.toLocaleTimeString('en-gb')}:</span> {text}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function App() {
	const { app, theme, infoOpen, openInfo, closeInfo, setTheme, setApp } = useAppSettings();
	const confirmation = useContextMenuStore((s) => s.confirmation);

	useEffect(() => {
		const titleApp = APPS.find((a) => window.location.pathname.endsWith(a)) ?? null;
		if (titleApp != null && titleApp !== app) setApp(titleApp);

		const icon = document.head.querySelector("link[rel~='icon']") as HTMLAnchorElement;
		icon.href = app === 'feid' ? './feid.png' : './favicon.png';
	}, [app, setApp]);

	const selectApp = (a: (typeof APPS)[number]) => {
		window.history.replaceState(null, '', a);
		setApp(a as any);
	};

	useEventListener('action+switchTheme', () =>
		setTheme(themeOptions[(themeOptions.indexOf(theme) + 1) % themeOptions.length])
	);
	document.documentElement.setAttribute('main-theme', theme);

	useEventListener('action+openInfo', () => (infoOpen ? closeInfo() : openInfo()));
	useEventListener('escape', closeContextMenu);
	useEventListener('mousedown', closeContextMenu);
	useEventListener('contextmenu', (e: PointerEvent) => {
		e.preventDefault();
		closeContextMenu();
	});
	useEventListener('keydown', handleGlobalKeydown);

	if (app === null)
		return (
			<div style={{ margin: '2em 3em', lineHeight: '2em', fontSize: 20 }} className="AppSelect">
				<title>Cosmic Rays Research Workstation - IZMIRAN</title>
				<meta
					name="description"
					content="A set of publicly available data applications used for research in IZMIRAN cosmic rays department"
				/>
				<h2>Select an application:</h2>
				<button className="TextButton" onClick={() => selectApp('feid')}>
					- Forbush Effects and Interplanetary Disturbances catalogue
				</button>
				<button className="TextButton" onClick={() => selectApp('ros')}>
					- Ring of Stations method
				</button>
				<button className="TextButton" onClick={() => selectApp('meteo')}>
					- Atmospheric temperature
				</button>
				<button className="TextButton" onClick={() => selectApp('neutron')}>
					- Neutron monitors
				</button>
				<button className="TextButton" onClick={() => selectApp('muon')}>
					- Muon telescopes
				</button>
				<button className="TextButton" onClick={() => selectApp('omni')}>
					- Interplanetary medium (omni)
				</button>
			</div>
		);

	const showNav = !['ros', 'help'].includes(app);
	return (
		<div className="bbox" style={{ overflow: 'clip' }}>
			<CatchErrors>
				<div
					className="bbox"
					style={{ height: `calc(100vh - ${showNav ? 24 : 0}px)`, width: '100vw', padding: '4px 4px 2px 4px' }}
				>
					{app === 'ros' && <PlotCirclesStandalone />}
					{app === 'feid' && <EventsApp />}
					{app === 'meteo' && <TemperatureApp />}
					{app === 'neutron' && <Neutron />}
					{app === 'muon' && <MuonApp />}
					{app === 'omni' && <OmniApp />}
				</div>
			</CatchErrors>
			<CatchErrors>{app !== 'feid' && <ContextMenu />}</CatchErrors>
			{confirmation && (
				<CatchErrors>
					<Confirmation closeSelf={closeConfirmation} callback={confirmation.callback}>
						{confirmation.content}
					</Confirmation>
				</CatchErrors>
			)}
			{infoOpen && <Info />}
			{showNav && (
				<div className="AppNav" onContextMenu={openContextMenu('app')}>
					<div>
						<select value={app} onChange={(e) => selectApp(e.target.value as any)}>
							{APPS.map((a) => (
								<option key={a} value={a}>
									/{a}
								</option>
							))}
						</select>
					</div>
					<AuthNav />
					{app === 'feid' && <LayoutNav />}
					<div title="Application colors scheme" style={{ paddingLeft: 8 }}>
						theme:
						<select
							style={{ width: theme.length + 4 + 'ch' }}
							value={theme}
							onChange={(e) => setTheme(e.target.value as any)}
						>
							{themeOptions.map((th) => (
								<option key={th} value={th}>
									{th}
								</option>
							))}
						</select>
					</div>
					<div style={{ flex: 1 }} />
					<Logs />
					<div>
						<button
							className="TextButton"
							style={{ color: 'var(--color-text)', padding: '0px 16px' }}
							onClick={() => openInfo()}
						>
							Info & Manual
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

export default function AppWrapper() {
	const { renderColors } = useAppSettings();
	return (
		<div style={{ ...renderColors(), color: 'var(--color-text)', background: 'var(--color-bg)' }}>
			<QueryClientProvider client={theQueryClient}>
				<AuthWrapper>
					<App />
				</AuthWrapper>
			</QueryClientProvider>
		</div>
	);
}
