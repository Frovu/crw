import { QueryClient, QueryClientProvider, useMutation, useQuery } from 'react-query';
import { createContext, useContext, useEffect, useState } from 'react';
import Table from './table/Table';
import Circles from './plots/Circles';
import { useEventListener, useMutationHandler } from './util';
import './css/index.css';
import Help from './Help';
import PlotIMF from './plots/IMF';
import PlotGSMAnisotropy from './plots/GSMAnisotropy';

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
	const { mutate, isSuccess, color, report, setReport } = useMutationHandler(async () => {
		const res = await fetch(`${process.env.REACT_APP_API}api/auth/${type}`, {
			method: 'POST', credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(upsertMode ? { login, password, role } : passMode ? { password, newPassword } : { login, password })
		});
		if (res.status === 400)
			throw new Error('Bad request');
		if (res.status === 404)
			throw new Error('User not found');
		if (res.status === 401)
			throw new Error('Wrong password');
		if (res.status !== 200)
			throw new Error(`HTTP: ${res.status}`);
		return await res.text();
	}, ['auth', 'samples', 'tableStructure', 'tableData']);

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
					mutate(null);
				}}>{passMode ? 'Change' : upsertMode ? 'Upsert' : 'Login' }</button>
			</div>
		</div>
	</>);
}

export function AuthButton() {
	const [ hovered, setHovered ] = useState(0);
	const { login, role, promptLogin } = useContext(AuthContext);
	const mutation = useMutation(async () => {
		await fetch(`${process.env.REACT_APP_API}api/auth/logout`, {
			method: 'POST', credentials: 'include'
		});
	}, {
		onSuccess: () => ['auth', 'samples', 'tableStructure', 'tableData'].forEach(a => theQueryClient.invalidateQueries([a]))
	});

	return (
		<div style={{ cursor: 'pointer', width: '12em', textAlign: 'center' }}>
			<div style={{ color: hovered === 1 ? 'var(--color-active)' : 'var(--color-text-dark)' }}
				onMouseEnter={() => setHovered(1)} onMouseLeave={() => setHovered(0)}
				onClick={e => {e.stopPropagation(); login ? mutation.mutate() : promptLogin('login');}}>
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
	const apps = ['ros', 'help', 'test'];
	const app = apps.find(a => window.location.pathname.endsWith(a)) ?? 'feid';
	useEffect(() => {
		document.title = {
			ros: 'RoS',
			help: 'AID Manual',
			feid: 'FEID',
			test: 'test',
		}[app]!;
	}, [app]);

	const [authPrompt, setAuthPrompt] = useState<null | 'password' | 'login' | 'upsert'>(null);
	const query = useQuery(['auth'], async () => {
		const res = await fetch(`${process.env.REACT_APP_API}api/auth/login`, { credentials: 'include' });
		if (res.status !== 200)
			throw new Error('HTTP '+res.status);
		return await res.json();
	});
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
					<PlotGSMAnisotropy {...{
						subtractTrend: true, showAz: true, maskGLE: true, useA0m: true,
						interval: [new Date('2022-07-18'), new Date('2022-07-21')],
						onsets: [ { time: new Date('2022-07-18T21:19:00Z'), type: 'SSC' } ],
						clouds: [{ start: new Date('2022-07-19T05:00:00Z'), end: new Date('2022-07-20T11:00:00Z') }],
						showGrid: true, showLegend: true, showMarkers: true, showBxBy: true, showBz: true, showMetaInfo: true, showTimeAxis: true }}/>

				</div>}
			{app === 'ros' && <Circles/>}
			{app === 'feid' && <Table/>}
			{app === 'help' && <Help/>}
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