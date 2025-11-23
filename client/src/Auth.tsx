import { useContext, useState, useEffect, type ReactNode, type KeyboardEvent } from 'react';
import { AuthContext, logSuccess } from './app';
import { useMutationHandler, apiPost, apiGet, useEventListener } from './util';
import { useQuery } from '@tanstack/react-query';
import { Button } from './components/Button';
import { Popup } from './components/Popup';
import { TextInput } from './components/Input';

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
		<Popup onClose={closePrompt} className="w-86 flex flex-col items-end gap-2 pr-6">
			<h2 className="w-full font-bold py-3">
				{upsertMode ? 'Upsert user' : !passMode ? (createMode ? 'CRW Register' : 'CRW Login') : 'Change password'}
			</h2>
			<div>
				Username:&nbsp;
				<TextInput
					value={login}
					{...(passMode && { disabled: true, value: currentLogin })}
					onChange={(e) => setLogin(e.target.value)}
					onKeyDown={ifEnter}
				/>
			</div>
			{upsertMode && (
				<div>
					Role:&nbsp;
					<TextInput value={role} onChange={(e) => setRole(e.target.value)} />
				</div>
			)}
			<div>
				Password:&nbsp;
				<TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={ifEnter} />
			</div>
			{passMode && (
				<div>
					New password:&nbsp;
					<TextInput
						type="password"
						value={newPassword}
						onChange={(e) => setnewPassword(e.target.value)}
						onKeyDown={ifEnter}
					/>
				</div>
			)}
			{(passMode || createMode) && (
				<div title="Repeat password">
					Confirm:&nbsp;
					<TextInput
						type="password"
						value={newPassword2}
						onChange={(e) => setnewPassword2(e.target.value)}
						onKeyDown={ifEnter}
					/>
				</div>
			)}
			{type === 'login' && !createMode && <Button onClick={() => setCreateMode(true)}>Create account</Button>}
			<div className="flex gap-4 items-start">
				<div className="grow h-10 leading-4 pt-1" style={{ color }}>
					{report?.error ?? report?.success}
				</div>
				<Button variant="default" className="px-4" onClick={submit}>
					{passMode ? 'Change' : upsertMode ? 'Upsert' : createMode ? 'Register' : 'Login'}
				</Button>
			</div>
		</Popup>
	);
}

export function AuthNav() {
	const { login, role, promptLogin } = useContext(AuthContext);
	const { mutate } = useMutationHandler(() => apiPost('auth/logout'), ['auth', 'samples', 'Tables', 'tableData']);

	return (
		<div className="group relative flex items-center text-dark whitespace-nowrap">
			<div className="group-hover:invisible px-2">{login ? `${login}:${role}` : 'not logged in'}</div>
			<Button
				className="absolute w-full h-full invisible group-hover:visible"
				onClick={(e) => {
					e.stopPropagation();
					if (!login) promptLogin('login');
					else mutate({}, { onSuccess: () => logSuccess('Logged out') });
				}}
			>
				{login ? 'log out?' : 'log in?'}
			</Button>
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
