import { useContext, useState } from 'react';
import { SampleContext, SettingsContext, TableContext } from '../table/Table';
import { MenuSelect } from '../table/TableMenu';
import { useSize } from '../util';
import { axisDefaults, color, drawBackground } from './plotUtil';
import UplotReact from 'uplot-react';
import { clickDownloadPlot } from './plotUtil';
import { useQueries } from 'react-query';
import uPlot from 'uplot';

function collisionOptions(grid: boolean): Omit<uPlot.Options, 'height'|'width'> {
	return {
		padding: [16, 0, 0, 0],
		legend: { show: false },
		hooks: {
			drawClear: [ drawBackground ],
			draw: [ ],
		},
		axes: [
			{
				...axisDefaults(grid),
				values: (u, vals) => vals.map(v => v + 'h')
			},
			{
				...axisDefaults(false),
				label: '',
				scale: 'y'
			},
		],
		scales: {
			x: { time: false },
			y: { },
		},
		series: [
			{ },
			{
				scale: 'y',
				label: 'Sample A',
				stroke: color('magenta', .8),
				width: 2,
				// fill: color('magenta', .3),
				points: { show: false }
			},
		]
	};
}
export default function EpochCollision() {
	const { data: currentData, samples } = useContext(SampleContext);
	const { settings: { plotGrid, plotTimeOffset: interval } } = useContext(SettingsContext);
	const { columns, series } = useContext(TableContext);

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	const [state, setState] = useState({
		timeColumn: 'time',
		series: 'a10m',
		sample0: '<current>',
		sample1: null as null | string,
		sample2: null as null | string,
	});

	const queryHandler = (sample: string | null) => async () => {
		if (!sample) return;
		const colIdx = columns.findIndex(c => c.fullName === state.timeColumn)!;
		const times = currentData.map(row => row[colIdx]).filter(t => t).map(t => Math.floor(t.getTime() / 36e5) * 3600);
		const res = await fetch(`${process.env.REACT_APP_API}api/events/epoch_collision`, {
			method: 'POST', credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ times, interval, series: state.series })
		});
	
		if (res.status !== 200)
			throw Error('HTTP '+res.status);
		const body = await res.json() as { offset: number[], mean: number[], median: number[], std: number[] };
		return [
			body.offset,
			body.median,
			body.mean,
			body.std
		];
	};

	const qk = ['epoch', interval, state.series];
	const queries = useQueries([
		{ queryKey: [...qk, state.sample0], queryFn: queryHandler(state.sample0), staleTime: Infinity },
		{ queryKey: [...qk, state.sample1], queryFn: queryHandler(state.sample1), staleTime: Infinity },
		{ queryKey: [...qk, state.sample2], queryFn: queryHandler(state.sample2), staleTime: Infinity },
	]);

	const status = (() => {
		if (queries[0].isLoading)
			return <div className='Center'>LOADING...</div>;
		if (queries[0].isError)
			return <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>;
		if (!queries[0].data)
			return <div className='Center'>NO DATA</div>;
		return null;
	})();

	const options = { 
		width: size.width,
		height: size.height - (container?.offsetHeight || 36), 
		...collisionOptions(plotGrid) };
	const data = queries[0].data && [
		...queries[0].data,
		...(queries[1].data?.slice(1) || []),
		...(queries[2].data?.slice(1) || [])
	] as any; // FIXME: offset (x) is assumed to be the same on all queries

	const set = (key: string) => (value: any) => setState(st => st && ({ ...st, [key]: value }));
	const timeOptions = columns.filter(col => col.type === 'time').map(col => col.fullName);
	const sampleOptions = ['<current>', '<all>'].concat(samples.map(s => s.name));

	return (<div ref={node => setContainer(node)}>
		<div style={{ padding: '4px 0 0 4px' }}>
			<MenuSelect text='' width='8ch' value={state.series} options={Object.keys(series)} pretty={Object.values(series)} callback={set('series')}/>
			<MenuSelect text=' Time' width='6ch' value={state.timeColumn} options={timeOptions} callback={set('timeColumn')}/>
			<MenuSelect text=' A' width='12ch' value={state.sample0} options={sampleOptions} callback={set('sample0')}/>
			<MenuSelect text=' B' width='12ch' withNull={true} value={state.sample1} options={sampleOptions} callback={set('sample1')}/>
			{(state.sample1 || state.sample2) && <MenuSelect text=' C' width='12ch' withNull={true} value={state.sample2} options={sampleOptions} callback={set('sample2')}/>}
		</div>
		{!status && <div style={{ position: 'absolute' }} onClick={clickDownloadPlot}>
			<UplotReact {...{ options, data }}/>
		</div>}
		{status}
	</div>);
}