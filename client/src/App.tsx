import { QueryClient, QueryClientProvider, useMutation, useQuery } from 'react-query';
import { createContext, useContext, useEffect, useState } from 'react';
import Table from './table/Table';
import Circles from './plots/Circles';
import { useEventListener } from './util';
import './css/index.css';

const theQueryClient = new QueryClient();

export const AuthContext = createContext<{ login?: string, role?: string, promptLogin: () => void }>({} as any);

function AuthPrompt({ closePrompt }: {closePrompt: () => void}) {
	const [error, setError] = useState<string | null>(null);
	const [login, setLogin] = useState('');
	const [password, setPassword] = useState('');
	const mutation = useMutation(async () => {
		const res = await fetch(`${process.env.REACT_APP_API}api/auth/login`, {
			method: 'POST', credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ login, password })
		});
		if (res.status === 400)
			throw new Error('Bad request');
		if (res.status === 404)
			throw new Error('User not found');
		if (res.status === 401)
			throw new Error('Wrong password');
		if (res.status !== 200)
			throw new Error(`HTTP: ${res.status}`);
	}, {
		onError: (err: any) => setError(err.message),
		onSuccess: () => {
			theQueryClient.invalidateQueries(['auth']);
			closePrompt();
		}
	});

	useEffect(() => {
		const timeout = setTimeout(() => setError(null), 3000);
		return () => clearTimeout(timeout);
	}, [error]);

	return (<>
		<div className='PopupBackground' onClick={closePrompt}/>
		<div className='Popup' style={{ left: '20vw', top: '20vh', padding: '1em 2.5em 2.5em 2em' }}>
			<b>AID Login</b>
			<div style={{ textAlign: 'right' }}>
				<p>
					User:&nbsp;
					<input type='text' style={{ width: '11em' }} onChange={e => setLogin(e.target.value)}/>
				</p>
				<p>
					Password:&nbsp;
					<input type='password' style={{ width: '11em' }} onChange={e => setPassword(e.target.value)}/>
				</p>
			</div>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end' }}>
				<span style={{ color: 'var(--color-red)', width: '12em', textAlign: 'center' }}>{error}</span>
				<button style={{ width: '5em', height: '1.5em' }} onClick={() => mutation.mutate()}>Login</button>
			</div>
		</div>
	</>);
}

export function AuthButton() {
	const [ hovered, setHovered ] = useState(false);
	const { login, promptLogin } = useContext(AuthContext);
	const mutation = useMutation(async () => {
		await fetch(`${process.env.REACT_APP_API}api/auth/logout`, {
			method: 'POST', credentials: 'include'
		});
	}, {
		onSuccess: () => theQueryClient.invalidateQueries(['auth'])
	});

	return (
		<div style={{ cursor: 'pointer', width: '10em', textAlign: 'center', color: hovered ? 'var(--color-active)' : 'var(--color-text-dark)' }}
			onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
			onClick={e => {e.stopPropagation(); login ? mutation.mutate() : promptLogin();}}>
			{login ? (hovered ? 'log out?' : `@ ${login}`) : (hovered ? 'log in?' : 'not logged in')}
		</div>
	);
}

function App() {
	const [authPrompt, setAuthPrompt] = useState(false);
	const query = useQuery(['auth'], async () => {
		const res = await fetch(`${process.env.REACT_APP_API}api/auth/login`, { credentials: 'include' });
		if (res.status !== 200)
			throw new Error('HTTP '+res.status);
		return await res.json();
	});
	if (query.error)
		console.error('Failed to fetch auth: ', query.error);

	useEventListener('escape', () => setAuthPrompt(false));

	return (
		<AuthContext.Provider value={{
			...query.data,
			promptLogin: () => setAuthPrompt(true),
		}}>
			{window.location.pathname.endsWith('ros') ? <Circles/> : <Table/>}
			{authPrompt && <AuthPrompt closePrompt={() => setAuthPrompt(false)}/>}
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
