import { useContext, useState, useEffect, type ReactNode } from 'react';
import { AuthContext } from './app';
import { useMutationHandler, apiPost, apiGet, useEventListener } from './util';
import { useQuery } from 'react-query';

export function AuthPrompt({ closePrompt, type }: {closePrompt: () => void, type: 'login' | 'password' | 'upsert'}) {
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
			<b>{upsertMode ? 'Upsert user' : !passMode ? 'CRW Login' : 'Change password'}</b>
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

export function AuthNav() {
	const [ hovered, setHovered ] = useState(0);
	const { login, role, promptLogin } = useContext(AuthContext);
	const { mutate } = useMutationHandler(() => apiPost('auth/logout'), ['auth', 'samples', 'tableStructure', 'tableData']);

	return (
		<div style={{ cursor: 'pointer', padding: '2px 8px', minWidth: '9em', textAlign: 'center' }}>
			<div style={{ color: hovered === 1 ? 'var(--color-active)' : 'var(--color-text-dark)' }}
				onMouseEnter={() => setHovered(1)} onMouseLeave={() => setHovered(0)}
				onClick={e => {e.stopPropagation(); login ? mutate({}) : promptLogin('login');}}>
				{login ? (hovered ? 'log out?' : `${login}:${role}`) : (hovered ? 'log in?' : 'not logged in')}
			</div>
			{login && <div style={{ color: hovered === 2 ? 'var(--color-active)' : 'var(--color-text-dark)' }}
				onMouseEnter={() => setHovered(2)} onMouseLeave={() => setHovered(0)}
				onClick={e => {e.stopPropagation(); promptLogin('password');}}>
				{hovered ? 'set password?' : `role: ${role}`}
			</div>}
		</div>
	);
}

export function AuthWrapper({ children }: { children: ReactNode }) {
	const [authPrompt, setAuthPrompt] = useState<null | 'password' | 'login' | 'upsert'>(null);
	const query = useQuery(['auth'], () => apiGet('auth/login'));
	if (query.error)
		console.error('Failed to fetch auth: ', query.error);

	useEventListener('escape', () => setAuthPrompt(null));

	return <AuthContext.Provider value={{
		...query.data,
		promptLogin: setAuthPrompt,
	}}>
		{children}
		{authPrompt && <AuthPrompt type={authPrompt} closePrompt={() => setAuthPrompt(null)}/>}
	</AuthContext.Provider>;
}