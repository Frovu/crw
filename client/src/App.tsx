import { QueryClient, QueryClientProvider, useQuery } from 'react-query';
import { useEffect, useState } from 'react';
import Table from './events/Table';
import { PlotCirclesStandalone } from './plots/time/Circles';
import { apiGet, useEventListener } from './util';
import './styles/index.css';
import Help from './Help';
import PlotGSM from './plots/time/GSM';
import TemperatureApp from './data/muon/Temperature';
import Neutron from './data/neutron/Neutron';
import MuonApp from './data/muon/Muon';
import OmniApp from './data/omni/Omni';
import { AuthContext } from './constants';
import { AuthPrompt } from './Auth';

const theQueryClient = new QueryClient();

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