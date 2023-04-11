import { useContext, useMemo, useState } from 'react';
import { SampleContext, SettingsContext, TableContext } from '../table/Table';
import { MenuCheckbox, MenuSelect } from '../table/TableMenu';
import { useSize } from '../util';
import { axisDefaults, color, drawBackground } from './plotUtil';
import UplotReact from 'uplot-react';
import { clickDownloadPlot } from './plotUtil';
import { useQueries } from 'react-query';
import uPlot from 'uplot';
import { applySample } from '../table/Sample';

const colors = ['green', 'purple', 'magenta'];

function collisionOptions(grid: boolean, med: boolean, std: boolean, show: boolean[]): Omit<uPlot.Options, 'height'|'width'> {
	return {
		padding: [16, 0, 0, 0],
		// legend: { show: false },
		hooks: {
			drawClear: [ drawBackground ],
			draw: [ ],
		},
		axes: [
			{
				...axisDefaults(grid),
				gap: 4,
				values: (u, vals) => vals.map(v => v + 'h')
			},
			{
				...axisDefaults(grid),
				gap: 8,
				space: 48,
				label: '',
				scale: 'y'
			},
		],
		scales: {
			x: { time: false },
			y: { },
		},
		series: [
			{
				label: 'offset',
				value: (u, val) => val ? val + (Math.abs(val) < 10 ? ' ' : '') + 'h' : '--'
			},
			...['A', 'B', 'C'].map((letter, i) => !show[i] ? [] : [
				{
					show: med,
					scale: 'y',
					label: `med ${letter}`,
					stroke: color(colors[i], .5),
					width: 2,
					value: (u, val) => val?.toFixed(2),
					// fill: color('magenta', .3),
					points: { show: false }
				},
				{
					scale: 'y',
					label: `mean ${letter}`,
					stroke: color(colors[i]),
					width: 2,
					value: (u, val) => val?.toFixed(2),
					// fill: color('magenta', .3),
					points: { show: false }
				},
				{
					show: std,
					scale: 'y',
					label: `σ ${letter}`,
					stroke: color(colors[i]),
					width: 1,
					value: (u, val) => val?.toFixed(2),
					// fill: color('magenta', .3),
					points: { show: false }
				},
			] as uPlot.Series[]).flat()
		]
	};
}
export default function EpochCollision() {
	const { data: currentData, samples: samplesList } = useContext(SampleContext);
	const { settings: { plotGrid, plotTimeOffset: interval } } = useContext(SettingsContext);
	const { columns, series, data: tableData } = useContext(TableContext);

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	const [state, setState] = useState({
		timeColumn: 'time',
		series: 'a10m',
		sample0: '<current>',
		sample1: null as null | string,
		sample2: null as null | string,
		showMedian: false,
		showStd: false,
	});

	const samples = useMemo(() => [state.sample0, state.sample1, state.sample2].map(name => {
		if (!name) return null;
		if (name === '<current>') return currentData;
		if (name === '<all>') return tableData;
		const found = samplesList.find(s => s.name === name);
		if (!found) return null;
		return applySample(tableData, found, columns);
	}), [state.sample0, state.sample1, state.sample2, currentData, tableData, samplesList, columns]);

	const queryHandler = (sample: any[][] | null) => async () => {
		if (!sample) return;
		const colIdx = columns.findIndex(c => c.fullName === state.timeColumn)!;
		const times = sample.map(row => row[colIdx]).filter(t => t).map(t => Math.floor(t.getTime() / 36e5) * 3600);
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
		{ queryKey: [...qk, samples[0]], queryFn: queryHandler(samples[0]), staleTime: Infinity },
		{ queryKey: [...qk, samples[1]], queryFn: queryHandler(samples[1]), staleTime: Infinity },
		{ queryKey: [...qk, samples[2]], queryFn: queryHandler(samples[2]), staleTime: Infinity },
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
		height: size.height - (container?.offsetHeight || 36) - 36, 
		...collisionOptions(plotGrid, state.showMedian, state.showStd, samples.map(s => !!s)) };
	const data = queries[0].data && [
		...queries[0].data,
		...(queries[1].data?.slice(1) || []),
		...(queries[2].data?.slice(1) || [])
	] as any; // FIXME: offset (x) is assumed to be the same on all queries

	const set = (key: string) => (value: any) => setState(st => st && ({ ...st, [key]: value }));
	const timeOptions = columns.filter(col => col.type === 'time').map(col => col.fullName);
	const sampleOptions = ['<current>', '<all>'].concat(samplesList.map(s => s.name));

	return (<div ref={node => setContainer(node)}>
		<div style={{ padding: '2px 0 0 4px', lineHeight: '2em' }}>
			<MenuSelect text='' width='8ch' value={state.series} options={Object.keys(series)} pretty={Object.values(series)} callback={set('series')}/>
			<MenuSelect text=' Time' width='6ch' value={state.timeColumn} options={timeOptions} callback={set('timeColumn')}/>
			<MenuCheckbox text=' med' value={state.showMedian} callback={set('showMedian')}/>
			<MenuCheckbox text='σ' value={state.showStd} callback={set('showStd')}/>
			<MenuSelect text=' A' width='11ch' value={state.sample0} options={sampleOptions} callback={set('sample0')}/>
			<MenuSelect text=' B' width='9ch' withNull={true} value={state.sample1} options={sampleOptions} callback={set('sample1')}/>
			{(state.sample1 || state.sample2) && <MenuSelect text=' C' width='9ch' withNull={true} value={state.sample2} options={sampleOptions} callback={set('sample2')}/>}
		</div>
		{!status && <div style={{ position: 'absolute' }} onClick={clickDownloadPlot}>
			<UplotReact {...{ options, data }}/>
		</div>}
		{status}
	</div>);
}