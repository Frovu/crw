import { QueryClient, QueryClientProvider } from 'react-query';
import Table from './table/Table';
import Circles from './plots/Circles';
const theQueryClient = new QueryClient();

function App() {
	if (window.location.pathname.endsWith('ros'))
		return <Circles/>;
	return <Table/>;
}

export default function AppWrapper() {
	return <QueryClientProvider client={theQueryClient}><App/></QueryClientProvider>;
}
