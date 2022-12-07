import './css/App.css';
import { QueryClient, QueryClientProvider } from 'react-query';
import Table from './table/Table';
const theQueryClient = new QueryClient();

function App() {
	return (
		<div className="App">
			<Table/>
		</div>
	);
}

export default function AppWrapper() {

	return <QueryClientProvider client={theQueryClient}><App/></QueryClientProvider>;
}
