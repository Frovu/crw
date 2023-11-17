import { useContext, useMemo } from 'react';
import { apiPost } from '../util';
import { axisDefaults, color, measureDigit, scaled } from './plotUtil';
import { useQueries } from 'react-query';
import uPlot from 'uplot';
import { applySample } from '../events/sample';
import { MainTableContext, PanelParams, SampleContext, shortTable, useEventsSettings } from '../events/events';
import { LayoutContext, ParamsSetter } from '../Layout';
import { ExportableUplot } from '../events/ExportPlot';
import { CustomAxis, drawCustomLabels } from './BasicPlot';

const colors = ['green', 'purple', 'magenta'];
const seriesKeys = ['series0', 'series1', 'series2'] as const;
const sampleKeys = ['sample0', 'sample1', 'sample2'] as const;

const defaultOptions = {
	timeColumn: 'fe_time',
	series0: 'a10m',
	series1: null as null | string,
	series2: null as null | string,
	sample0: '<current>',
	sample1: '<current>',
	sample2: '<current>',
	showEpochMedian: false,
	showEpochStd: true,
	epochOneScale: false,
};

export type CollisionOptions = typeof defaultOptions;

export function EpochCollisionContextMenu({ params, setParams }: { params: PanelParams, setParams: ParamsSetter }) {
	const { series: seriesOptions } = useContext(MainTableContext);
	const { columns } = useContext(MainTableContext);
	const { samples } = useContext(SampleContext);
	const cur = { ...defaultOptions, ...params.statParams };
	const timeOptions = columns.filter(col => col.type === 'time');
	const set = <T extends keyof CollisionOptions>(k: T, val: CollisionOptions[T]) =>
		setParams('statParams', { [k]: val });
	
	return <div className='Group'>
		{(['A', 'B', 'C']).map((letter, i) => <div key={letter} className='Row' style={{ paddingRight: 4 }}>
			<div><span title='Reset' style={{ color: color(colors[i]), cursor: 'pointer' }}
				onClick={() => {set(seriesKeys[i], null); set(sampleKeys[i], '<current>');}}>{letter}:</span>
			<select title='Data series' className='Borderless' style={{ width: '7em', marginLeft: 2,
				color: cur[seriesKeys[i]] == null ? color('text-dark') : 'unset' }}
			value={cur[seriesKeys[i]] ?? '__none'} onChange={e =>
				set(seriesKeys[i],e.target.value === '__none' ? null : e.target.value)}>
				<option value='__none'>&lt;none&gt;</option>
				{Object.entries(seriesOptions).map(([id, name]) =>
					<option key={id} value={id}>{name}</option>)}
			</select>:
			<select title='Sample (none = all events)' className='Borderless'
				style={{ width: '7.5em', marginLeft: 1,
					color: cur[sampleKeys[i]] === '<current>' ? color('text-dark') : 'unset' }}
				value={cur[sampleKeys[i]]} onChange={e => set(sampleKeys[i], e.target.value)}>
				<option value='<none>'>&lt;none&gt;</option>
				<option value='<current>'>&lt;current&gt;</option>
				{samples.map(({ id, name }) => <option key={id} value={id.toString()}>{name}</option>)}
			</select></div>
		</div>)}
		<div> Time source:<select className='Borderless'
			style={{ width: '7.5em', margin: '0 4px', padding: 0 }}
			value={cur.timeColumn} onChange={e => set('timeColumn', e.target.value as any)}>
			{timeOptions.map(({ id, entity }) =>
				<option key={id} value={id}>{shortTable(entity)} time</option>)}
		</select> </div>
		<div className='Row'>
			<label>Plot median<input type='checkbox' style={{ paddingLeft: 4 }}
				checked={cur.showEpochMedian} onChange={e => set('showEpochMedian', e.target.checked)}/></label>
			<label>std error<input type='checkbox' style={{ paddingLeft: 4 }}
				checked={cur.showEpochStd} onChange={e => set('showEpochStd', e.target.checked)}/></label>	
		</div>
	</div>;
}

export default function EpochCollision() {
	const { data: currentData, samples: samplesList } = useContext(SampleContext);
	const layoutParams = useContext(LayoutContext)?.params.statParams;
	const { plotOffset, showGrid } = useEventsSettings();
	const { columns, data: allData, series: seriesDict } = useContext(MainTableContext);

	const { sample0, sample1, sample2, timeColumn, ...cur } =  { ...defaultOptions, ...layoutParams };
	const series = [cur.series0, cur.series1, cur.series2];
	const samples = useMemo(() => [sample0, sample1, sample2].map((name) => {
		if (!name) return null;
		if (name === '<current>') return currentData;
		if (name === '<none>') return allData;
		const found = samplesList.find(s => s.id.toString() === name);
		return found ? applySample(allData, found, columns) : null;
	}), [sample0, sample1, sample2, currentData, allData, samplesList, columns]);

	const queryHandler =  async (qi: number) => {
		const sample = samples[qi];
		const colIdx = columns.findIndex(c => c.id === timeColumn);
		if (!sample || series[qi] == null || !sample.length || colIdx < 0) return;
		const interval = plotOffset, uri = 'events/epoch_collision';
		const times = sample.map(row => row[colIdx]).filter((t): t is Date => t as any)
			.map(t => Math.floor(t.getTime() / 36e5) * 3600);

		type Res = { offset: number[], mean: number[], median: number[], std: number[] };
		const { offset, median, mean, std } = await apiPost<Res>(uri, { times, interval, series: series[qi] });
		return [
			offset,
			median,
			mean,
			std.map((s, i, all) => mean[i] + s / Math.sqrt(all.length)),
			std.map((s, i, all) => mean[i] - s / Math.sqrt(all.length))
		];
	};

	const qk = ['epochCollision', ...plotOffset, timeColumn];
	const queries = useQueries([ // yes, query keys are cursed
		{ queryKey: [...qk, samples[0]?.length, samples[0]?.at(0), samples[0]?.at(-1), series[0]], queryFn: () => queryHandler(0), staleTime: Infinity },
		{ queryKey: [...qk, samples[1]?.length, samples[1]?.at(0), samples[1]?.at(-1), series[1]], queryFn: () => queryHandler(1), staleTime: Infinity },
		{ queryKey: [...qk, samples[2]?.length, samples[2]?.at(0), samples[2]?.at(-1), series[2]], queryFn: () => queryHandler(2), staleTime: Infinity },
	]);

	const { data, options } = useMemo(() => {
		// FIXME: offset (x) is assumed to be the same on all queries
		const time = queries.find(q => q.data)?.data?.[0];
		return {
			data: [
				time,
				...(queries[0].data?.slice(1) || []),
				...(queries[1].data?.slice(1) || []),
				...(queries[2].data?.slice(1) || [])
			] as any,
			options: () => {
				const filtered = queries.map((q, i) => q.data ? i : null).filter(q => q != null) as number[];
				const axScale = (idx: number) => series[idx] && seriesDict[series[idx]!];
				
				const ch = measureDigit().width, scale = scaled(1);
				return {
					cursor: { show: false },
					padding: [scaled(10), scaled(4), 0, 0],
					hooks: {
						draw: [ drawCustomLabels() ]
					},
					axes: [ {
						...axisDefaults(showGrid),
						size: scaled(26),
						space: ch * 4 + scaled(4),
						values: (u, vals) => vals.map(v => v + 'h')
					}, ...filtered.map((idx, i) => ({
						...axisDefaults(i === 0),
						side: i === 0 ? 3 : 1,
						show: i === 2 ? false : true,
						space: scaled(32),
						size: (u, vals) => ch * Math.max.apply(null, vals?.map(v => v.length)) + scale * 12,
						values: (u, vals) => vals.map(v => v.toString()), 
						scale: axScale(idx),
						fullLabel: seriesDict[series[idx]!], // add names if one ax
						label: '',
					})) as CustomAxis[] ],
					scales: { x: { time: false } },
					series: [
						{ }, ...filtered.map((idx, i) => [ {
							show: cur.showEpochMedian,
							scale: axScale(idx),
							stroke: color(colors[idx], .7),
							width: scaled(2),
							points: { show: false }
						}, {
							scale: axScale(idx),
							stroke: color(colors[idx]),
							width: scaled(3),
							value: (u, val) => val?.toFixed(2),
							points: { show: false }
						}, {
							show: cur.showEpochStd,
							scale: axScale(idx),
							stroke: color(colors[idx]),
							width: scaled(.9),
							points: { show: false }
						}, {
							show: cur.showEpochStd,
							scale: axScale(idx),
							stroke: color(colors[idx]),
							width: scaled(.9),
							points: { show: false }
						},
						] as uPlot.Series[]).flat()
					]
				} as Omit<uPlot.Options, 'width'|'height'>;
			}
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [cur.showEpochMedian, cur.showEpochStd, queries[0].data, queries[1].data, queries[2].data, samples, showGrid]);
	
	if (queries.some(q => q.isError))
		return <div className='Center' style={{ color: color('red') }}>FAILED TO LOAD</div>;
	if (queries.some(q => !q.data && q.isLoading))
		return <div className='Center'>LOADING...</div>;
	if (!queries.some(q => q.data))
		return <div className='Center'>EMPTY SAMPLE</div>;
	return <ExportableUplot {...{ options, data }}/>;
}