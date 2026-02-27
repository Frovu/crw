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
import { LayoutNav } from './LayoutNav';
import ContextMenu from './ContextMenu';
import { Button } from './components/Button';
import { SimpleSelect } from './components/Select';
import { CatchErrors } from './components/CatchErrors';
import { Confirmation } from './components/Confirmation';

const theQueryClient = new QueryClient();

const APP_NAME = {
	feid: 'Forbush Effects and Interplanetary Disturbances catalogue',
	ros: 'Ring of Stations method',
	meteo: 'Atmospheric temperature',
	neutron: 'Neutron monitors',
	muon: 'Muon telescopes',
	omni: 'Interplanetary medium (omni)',
} as const;

// Tanstack Query dev tools
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
			className="grow h-full max-w-128 relative"
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
		>
			{!expand && hover && (
				<Button className="w-full h-full" onClick={() => setExpand((s) => !s)}>
					show logs
				</Button>
			)}
			{!expand && !hover && last && show && (
				<div
					className="pl-1 overflow-clip whitespace-nowrap text-ellipsis"
					style={{ color: last.type === 'info' ? 'var(--color-dark)' : logColor[last.type] }}
				>
					{last.text}
				</div>
			)}
			{expand && (
				<div className="absolute p-1 flex flex-col-reverse bg-bg border break-all w-full h-64 overflow-y-scroll left-0 bottom-0 text-xs">
					{[...log].reverse().map(({ time, text, type }) => (
						<div key={time.getTime() + text} style={{ color: logColor[type] }}>
							<span className="text-dark">{time.toLocaleTimeString('en-gb')}:</span> {text}
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
		setTheme(themeOptions[(themeOptions.indexOf(theme) + 1) % themeOptions.length]),
	);
	document.documentElement.setAttribute('main-theme', theme);

	useEventListener('action+openInfo', () => (infoOpen ? closeInfo() : openInfo()));
	useEventListener('escape', closeContextMenu);
	useEventListener('mousedown', (e) => !(e.target instanceof HTMLHtmlElement) && closeContextMenu()); // fix for radix select
	useEventListener('contextmenu', (e: PointerEvent) => {
		e.preventDefault();
		closeContextMenu();
	});
	useEventListener('keydown', handleGlobalKeydown);

	if (app === null)
		return (
			<div>
				<title>Cosmic Rays Research Workstation - IZMIRAN</title>
				<meta
					name="description"
					content="A set of publicly available data applications used for research in IZMIRAN cosmic rays department"
				/>
				<h2 className="text-xl p-4 font-bold">Select an application:</h2>
				{Object.entries(APP_NAME).map(([ap, aname]) => (
					<Button className="block p-1 ml-8 text-lg" onClick={() => selectApp(ap as keyof typeof APP_NAME)}>
						- {aname}
					</Button>
				))}
			</div>
		);

	const showNav = !['ros', 'help'].includes(app);
	return (
		<div className="w-screen h-screen flex flex-col gap-[1px]">
			<CatchErrors>
				<div className="grow shrink min-h-0">
					{app === 'ros' && <PlotCirclesStandalone />}
					{app === 'feid' && <EventsApp />}
					{app === 'meteo' && <TemperatureApp />}
					{app === 'neutron' && <Neutron />}
					{app === 'muon' && <MuonApp />}
					{app === 'omni' && <OmniApp />}
				</div>
			</CatchErrors>
			{showNav && (
				<div
					className="flex z-20 h-6 px-[2px] gap-[1px] items-center text-sm border-t [&>*:nth-child(n+2)]:border-l [&>*:nth-child(n+2)]:h-full select-none"
					onContextMenu={openContextMenu('app')}
				>
					<SimpleSelect
						className="pl-2 h-5 w-21 text-dark"
						options={APPS.map((a) => [a, '/' + a])}
						value={app}
						onChange={(a) => selectApp(a)}
					/>
					<AuthNav />
					{app === 'feid' && <LayoutNav />}
					<div className="flex items-center pl-2 text-dark" title="Application color scheme">
						theme:
						<SimpleSelect
							className={theme === 'Monochrome' ? 'h-5 w-30' : 'h-5 w-16'}
							options={themeOptions.map((t) => [t, t])}
							value={theme}
							onChange={(th) => setTheme(th)}
						/>
					</div>
					<div className="grow h-full" />
					<Logs />
					<Button className="px-4" onClick={() => openInfo()}>
						Info & Manual
					</Button>
				</div>
			)}
			{confirmation && (
				<CatchErrors>
					<Confirmation closeSelf={closeConfirmation} callback={confirmation.callback}>
						{confirmation.content}
					</Confirmation>
				</CatchErrors>
			)}
			{app !== 'feid' && (
				<CatchErrors>
					<ContextMenu />
				</CatchErrors>
			)}
			{infoOpen && <Info />}
		</div>
	);
}

export default function AppWrapper() {
	const { renderColors } = useAppSettings();
	return (
		<div style={{ ...renderColors() }}>
			<QueryClientProvider client={theQueryClient}>
				<AuthWrapper>
					<App />
				</AuthWrapper>
			</QueryClientProvider>
		</div>
	);
}
