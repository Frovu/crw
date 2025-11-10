import { useContext, useState, useEffect, type ReactNode, type KeyboardEvent } from 'react';
import { AuthContext, logSuccess } from './app';
import { useMutationHandler, apiPost, apiGet, useEventListener } from './util';
import { useQuery } from '@tanstack/react-query';

export function AuthPrompt({ closePrompt, type }: { closePrompt: () => void; type: 'login' | 'password' | 'upsert' }) {
	const { login: currentLogin } = useContext(AuthContext);
	const [error, setError] = useState<string | null>(null);
	const [createMode, setCreateMode] = useState(false);
	const [login, setLogin] = useState('');
	const [role, setRole] = useState('');
	const [password, setPassword] = useState('');
	const [newPassword, setnewPassword] = useState('');
	const [newPassword2, setnewPassword2] = useState('');
	const { mutate, isSuccess, color, report, setReport } = useMutationHandler(
		() =>
			apiPost(
				`auth/${createMode ? 'register' : type}`,
				upsertMode ? { login, password, role } : passMode ? { password, newPassword } : { login, password }
			),
		['auth', 'samples', 'Tables', 'tableData']
	);

	useEffect(() => setCreateMode(false), []);

	useEffect(() => {
		const timeout = setTimeout(() => setError(null), 3000);
		return () => clearTimeout(timeout);
	}, [error]);

	const passMode = type === 'password';
	const upsertMode = type === 'upsert';
	if (isSuccess && !upsertMode) closePrompt();

	const submit = () => {
		if (passMode && (!newPassword || newPassword !== newPassword2)) return setReport({ error: 'Passwords do not match' });
		if (createMode && (!password || password !== newPassword2)) return setReport({ error: 'Passwords do not match' });
		mutate(
			{},
			{
				onSuccess: () =>
					logSuccess(
						passMode
							? 'Password changed'
							: (createMode ? 'User registered: ' : upsertMode ? 'Upserted: ' : 'Logged in: ') + login
					),
			}
		);
	};
	const ifEnter = (e: KeyboardEvent) => {
		e.code === 'Enter' && submit();
	};

	return (
		<>
			<div className="PopupBackground" onClick={closePrompt} />
			<div className="Popup" style={{ left: '20vw', top: '20vh', padding: '1em 2.5em 0 2em' }}>
				<b>{upsertMode ? 'Upsert user' : !passMode ? (createMode ? 'CRW Register' : 'CRW Login') : 'Change password'}</b>
				<div style={{ textAlign: 'right' }}>
					<p>
						Username:&nbsp;
						<input
							type="text"
							{...(passMode && { disabled: true, value: currentLogin })}
							style={{ width: '11em' }}
							onChange={(e) => setLogin(e.target.value)}
							onKeyDown={ifEnter}
						/>
					</p>
					{upsertMode && (
						<p>
							Role:&nbsp;
							<input type="text" style={{ width: '11em' }} onChange={(e) => setRole(e.target.value)} />
						</p>
					)}
					<p>
						Password:&nbsp;
						<input
							type="password"
							style={{ width: '11em' }}
							onChange={(e) => setPassword(e.target.value)}
							onKeyDown={ifEnter}
						/>
					</p>
					{passMode && (
						<p>
							New password:&nbsp;
							<input
								type="password"
								style={{ width: '11em' }}
								onChange={(e) => setnewPassword(e.target.value)}
								onKeyDown={ifEnter}
							/>
						</p>
					)}
					{(passMode || createMode) && (
						<p title="Repeat password">
							Confirm:&nbsp;
							<input
								type="password"
								style={{ width: '11em' }}
								onChange={(e) => setnewPassword2(e.target.value)}
								onKeyDown={ifEnter}
							/>
						</p>
					)}
				</div>
				{type === 'login' && !createMode && (
					<p style={{ textAlign: 'right' }}>
						<button className="TextButton" onClick={() => setCreateMode(true)}>
							Create account
						</button>
					</p>
				)}
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
					<span style={{ color, width: '12em', textAlign: 'center', minHeight: '3em' }}>{report?.error ?? report?.success}</span>
					<button style={{ width: '6em', height: '1.5em' }} onClick={submit}>
						{passMode ? 'Change' : upsertMode ? 'Upsert' : createMode ? 'Register' : 'Login'}
					</button>
				</div>
			</div>
		</>
	);
}

export function AuthNav() {
	const [hovered, setHovered] = useState(0);
	const { login, role, promptLogin } = useContext(AuthContext);
	const { mutate } = useMutationHandler(() => apiPost('auth/logout'), ['auth', 'samples', 'Tables', 'tableData']);

	return (
		<div
			style={{
				cursor: 'pointer',
				padding: '2px 8px',
				textAlign: 'center',
				minWidth: '9em',
				width: 3 + (login?.length ?? 4) + (role?.length ?? 5) + 'ch',
			}}
		>
			<div
				style={{ whiteSpace: 'nowrap', color: hovered === 1 ? 'var(--color-active)' : 'var(--color-text-dark)' }}
				onMouseEnter={() => setHovered(1)}
				onMouseLeave={() => setHovered(0)}
				onClick={(e) => {
					e.stopPropagation();
					login
						? mutate(
								{},
								{
									onSuccess: () => logSuccess('Logged out'),
								}
						  )
						: promptLogin('login');
				}}
			>
				{login ? (hovered ? 'log out?' : `${login}:${role}`) : hovered ? 'log in?' : 'not logged in'}
			</div>
		</div>
	);
}

export function AuthWrapper({ children }: { children: ReactNode }) {
	const [authPrompt, setAuthPrompt] = useState<null | 'password' | 'login' | 'upsert'>(null);
	const query = useQuery({
		queryKey: ['auth'],
		queryFn: () => apiGet('auth/login'),
	});
	if (query.error) console.error('Failed to fetch auth: ', query.error);

	useEventListener('escape', () => setAuthPrompt(null));

	return (
		<AuthContext.Provider
			value={{
				...query.data,
				promptLogin: setAuthPrompt,
			}}
		>
			{children}
			{authPrompt && <AuthPrompt type={authPrompt} closePrompt={() => setAuthPrompt(null)} />}
		</AuthContext.Provider>
	);
}
