import { QueryClient, QueryClientProvider, useQuery } from 'react-query';
import { createContext, useContext, useEffect, useState } from 'react';
import Table from './events/Table';
import { PlotCirclesStandalone } from './plots/time/Circles';
import { apiGet, apiPost, useEventListener, useMutationHandler } from './util';
import './styles/index.css';
import Help from './Help';
import PlotGSM from './plots/time/GSM';
import TemperatureApp from './data/muon/Temperature';
import Neutron from './data/neutron/Neutron';
import MuonApp from './data/muon/Muon';
import OmniApp from './data/omni/Omni';

const theQueryClient = new QueryClient();

export const AuthContext = createContext<{ login?: string, role?: string, promptLogin: (a: any) => void }>({} as any);

function AuthPrompt({ closePrompt, type }: {closePrompt: () => void, type: 'login' | 'password' | 'upsert'}) {
	const { login: currentLogin } = useContext(AuthContext);
	const [error, setError] = useState<string | null>(null);
	const [login, setLogin] = useState('');
	const [role, setRole] = useState('');
	const [password, setPassword] = useState('');
	const [newPassword, setnewPassword] = useState('');
	const [newPassword2, setnewPassword2] = useState('');
	const { mutate, isSuccess, color, report, setReport } = useMutationHandler(() => apiPost(`auth/${type}`,
		upsertMode ? { login, password, role } :
			passMode ? { password, newPassword } :
				{ login, password }),
	['auth', 'samples', 'tableStructure', 'tableData']);

	useEffect(() => {
		const timeout = setTimeout(() => setError(null), 3000);
		return () => clearTimeout(timeout);
	}, [error]);

	const passMode = type === 'password';
	const upsertMode = type === 'upsert';
	if (isSuccess && !upsertMode) closePrompt();

	return (<>
		<div className='PopupBackground' onClick={closePrompt}/>
		<div className='Popup' style={{ left: '20vw', top: '20vh', padding: '1em 2.5em 2.5em 2em' }}>
			<b>{upsertMode ? 'Upsert user' : !passMode ? 'AID Login' : 'Change password'}</b>
			<div style={{ textAlign: 'right' }}>
				<p>
					User:&nbsp;
					<input type='text' {...(passMode && { disabled: true, value: currentLogin })} style={{ width: '11em' }} onChange={e => setLogin(e.target.value)}/>
				</p>
				{upsertMode && <p>
					Role:&nbsp;
					<input type='text' style={{ width: '11em' }} onChange={e => setRole(e.target.value)}/>
				</p>}
				<p>
					Password:&nbsp;
					<input type='password' style={{ width: '11em' }} onChange={e => setPassword(e.target.value)}/>
				</p>
				{passMode && <p>
					New password:&nbsp;
					<input type='password' style={{ width: '11em' }} onChange={e => setnewPassword(e.target.value)}/>
				</p>}
				{passMode && <p>
					Confirm:&nbsp;
					<input type='password' style={{ width: '11em' }} onChange={e => setnewPassword2(e.target.value)}/>
				</p>}
			</div>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end' }}>
				<span style={{ color, width: '12em', textAlign: 'center' }}>{report?.error ?? report?.success}</span>
				<button style={{ width: '5em', height: '1.5em' }} onClick={() => {
					if (passMode && (!newPassword || newPassword !== newPassword2))
						return setReport({ error: 'Passwords do not match' });
					mutate({});
				}}>{passMode ? 'Change' : upsertMode ? 'Upsert' : 'Login' }</button>
			</div>
		</div>
	</>);
}

export function AuthButton() {
	const [ hovered, setHovered ] = useState(0);
	const { login, role, promptLogin } = useContext(AuthContext);
	const { mutate } = useMutationHandler(() => apiPost('auth/logout'), ['auth', 'samples', 'tableStructure', 'tableData']);

	return (
		<div style={{ cursor: 'pointer', width: '12em', textAlign: 'center' }}>
			<div style={{ color: hovered === 1 ? 'var(--color-active)' : 'var(--color-text-dark)' }}
				onMouseEnter={() => setHovered(1)} onMouseLeave={() => setHovered(0)}
				onClick={e => {e.stopPropagation(); login ? mutate({}) : promptLogin('login');}}>
				{login ? (hovered ? 'log out?' : `user: ${login}`) : (hovered ? 'log in?' : 'not logged in')}
			</div>
			{login && <div style={{ color: hovered === 2 ? 'var(--color-active)' : 'var(--color-text-dark)' }}
				onMouseEnter={() => setHovered(2)} onMouseLeave={() => setHovered(0)}
				onClick={e => {e.stopPropagation(); promptLogin('password');}}>
				{hovered ? 'set password?' : `role: ${role}`}
			</div>}

		</div>
	);
}

function App() {
	const apps = ['feid', 'ros', 'help', 'test', 'meteo', 'muon', 'neutron', 'omni'];
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

	const [authPrompt, setAuthPrompt] = useState<null | 'password' | 'login' | 'upsert'>(null);
	const query = useQuery(['auth'], () => apiGet('auth/login'));
	if (query.error)
		console.error('Failed to fetch auth: ', query.error);

	useEventListener('escape', () => setAuthPrompt(null));

	return (
		<AuthContext.Provider value={{
			...query.data,
			promptLogin: setAuthPrompt,
		}}>
			{app === 'test' && 
				<div style={{ width: 800, marginLeft: 20, height: 600, position: 'relative' }}>
					<PlotGSM params={{
						showAxy: true, showAxyVector: true,
						subtractTrend: true, showAz: true, maskGLE: true, useA0m: true,
						interval: [new Date('2023-04-23 08:00'), new Date('2023-04-26T10:00:00')],
						onsets: [ { time: new Date('2023-04-23T17:38:00Z'), type: 'SSC' } ],
						clouds: [{ start: new Date('2023-04-24T01:00:00Z'), end: new Date('2023-04-25T19:00:00Z') }],
						showGrid: true, showLegend: true, showMarkers: true, showMetaInfo: true, showTimeAxis: true }}/>

				</div>}
			{app === 'ros' && <PlotCirclesStandalone/>}
			{app === 'feid' && <Table/>}
			{app === 'help' && <Help/>}
			{app === 'meteo' && <TemperatureApp/>}
			{app === 'neutron' && <Neutron/>}
			{app === 'muon' && <MuonApp/>}
			{app === 'omni' && <OmniApp/>}
			{app === 'none' && <div style={{ margin: '2em 3em', lineHeight: '2em', fontSize: 20 }}>
				<h4>Select an application:</h4>
				- <a href='feid'>Forbush Effects and Interplanetary Disturbances catalogue</a><br/>
				- <a href='ros'>Ring of Stations method</a><br/>
				- <a href='meteo'>Atmospheric temperature</a><br/>
				- <a href='neutron'>Neutron monitors</a><br/>
				- <a href='muon'>Muon telescopes</a><br/>
				- <a href='omni'>Interplanetary medium (omni)</a>
			</div>}
			{authPrompt && <AuthPrompt type={authPrompt} closePrompt={() => setAuthPrompt(null)}/>}
		</AuthContext.Provider>
	);
}

export default function AppWrapper() {
	return (
		<QueryClientProvider client={theQueryClient}>
			<App/>
		</QueryClientProvider>
	);
}