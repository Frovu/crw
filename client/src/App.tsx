import { QueryClient, QueryClientProvider, useQuery } from 'react-query';
import { createContext, useState } from 'react';
import Table from './table/Table';
import Circles from './plots/Circles';
const theQueryClient = new QueryClient();

export const AuthContext = createContext<{ login?: string, role?: string, logout: () => void, promptLogin: () => void }>({} as any);

function App() {
	const query = useQuery(['auth'], async () => {
		const res = await fetch(`${process.env.REACT_APP_API}api/auth/login`, { credentials: 'include' });
		if (res.status !== 200)
			throw new Error('HTTP '+res.status);
		return await res.json();
	});
	if (query.error)
		console.error('Failed to fetch auth: ', query.error);

	return (
		<AuthContext.Provider value={{
			...query.data,
			logout: () => {},
			promptLogin: () => {},
		}}>
			{window.location.pathname.endsWith('ros') ? <Circles/> : <Table/>}
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
