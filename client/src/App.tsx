import { QueryClient, QueryClientProvider, useMutation, useQuery } from 'react-query';
import { createContext, useContext, useEffect, useState } from 'react';
import Table from './table/Table';
import Circles from './plots/Circles';
import { useEventListener, useMutationHandler } from './util';
import './css/index.css';

const theQueryClient = new QueryClient();

export const AuthContext = createContext<{ login?: string, role?: string, promptLogin: (a: any) => void }>({} as any);

function AuthPrompt({ closePrompt, type }: {closePrompt: () => void, type: 'login' | 'password'}) {
	const { login: currentLogin } = useContext(AuthContext);
	const [error, setError] = useState<string | null>(null);
	const [login, setLogin] = useState('');
	const [password, setPassword] = useState('');
	const [newPassword, setnewPassword] = useState('');
	const [newPassword2, setnewPassword2] = useState('');
	const { mutate, isSuccess, report, setReport } = useMutationHandler(async () => {
		const res = await fetch(`${process.env.REACT_APP_API}api/auth/${type}`, {
			method: 'POST', credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(mode ? { login, password } : { password, newPassword })
		});
		if (res.status === 400)
			throw new Error('Bad request');
		if (res.status === 404)
			throw new Error('User not found');
		if (res.status === 401)
			throw new Error('Wrong password');
		if (res.status !== 200)
			throw new Error(`HTTP: ${res.status}`);
	}, ['auth', 'tableStructure', 'tableData']);

	useEffect(() => {
		const timeout = setTimeout(() => setError(null), 3000);
		return () => clearTimeout(timeout);
	}, [error]);

	if (isSuccess) closePrompt();
	const mode = type === 'login';

	return (<>
		<div className='PopupBackground' onClick={closePrompt}/>
		<div className='Popup' style={{ left: '20vw', top: '20vh', padding: '1em 2.5em 2.5em 2em' }}>
			<b>{mode ? 'AID Login' : 'Change password'}</b>
			<div style={{ textAlign: 'right' }}>
				<p>
					User:&nbsp;
					<input type='text' {...(!mode && { disabled: true, value: currentLogin })} style={{ width: '11em' }} onChange={e => setLogin(e.target.value)}/>
				</p>
				<p>
					Password:&nbsp;
					<input type='password' style={{ width: '11em' }} onChange={e => setPassword(e.target.value)}/>
				</p>
				{!mode && <p>
					New password:&nbsp;
					<input type='password' style={{ width: '11em' }} onChange={e => setnewPassword(e.target.value)}/>
				</p>}
				{!mode && <p>
					Confirm:&nbsp;
					<input type='password' style={{ width: '11em' }} onChange={e => setnewPassword2(e.target.value)}/>
				</p>}
			</div>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end' }}>
				<span style={{ color: 'var(--color-red)', width: '12em', textAlign: 'center' }}>{report?.error}</span>
				<button style={{ width: '5em', height: '1.5em' }} onClick={() => {
					if (!mode && (!newPassword || newPassword !== newPassword2))
						return setReport({ error: 'Passwords do not match' });
					mutate(null);
				}}>{mode ? 'Login' : 'Change'}</button>
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
		onSuccess: () => ['auth', 'tableStructure', 'tableData'].forEach(a => theQueryClient.invalidateQueries([a]))
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
	const app = window.location.pathname.endsWith('ros') ? 'RoS' : 'FEID';
	useEffect(() => {
		document.title = app;
	}, [app]);

	const [authPrompt, setAuthPrompt] = useState<null | 'password' | 'login'>(null);
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
			promptLogin: (type: typeof authPrompt) => setAuthPrompt(type),
		}}>
			{app === 'RoS' ? <Circles/> : <Table/>}
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
