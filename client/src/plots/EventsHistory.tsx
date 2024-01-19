import { useContext, useMemo } from 'react';
import { useEventsSettings, type PanelParams, MainTableContext, SampleContext } from '../events/events';
import { LayoutContext, type ParamsSetter } from '../layout';
import type uPlot from 'uplot';
import { axisDefaults, markersPaths, measureDigit, scaled, type DefaultPosition, usePlotOverlayPosition } from './plotUtil';
import { color } from '../app';
import { ExportableUplot } from '../events/ExportPlot';
import { NumberInput } from '../Utility';
import { applySample } from '../events/sample';
import { drawCustomLegend } from './basicPlot';

const windowOptions = { '2 years': 24, '1 year': 12, '6 months': 6, '4 months': 4, '3 months': 3, '2 months': 2, '1 month': 1 } as const;

const seriesColors = ['green', 'purple', 'magenta', 'acid', 'cyan'] as const;
const seriesMarkers = ['diamond', 'circle', 'square', 'triangleUp', 'triangleDown'] as const;

type StatSeries = {
	sample: '<none>' | '<current>' | string,
	column: null | '<count>' | string,
};

const defaultOptions = {
	window: '1 year' as keyof typeof windowOptions,
	historySeries: [0, 1, 2, 3, 4].map(i =>
		({ sample: '<current>', column: i === 0 ? '<count>' : null })) as StatSeries[],
	forceLeft: null as null | number,
	forceRight: null as null | number,
	showYLabel: false,
};

export type HistoryOptions = typeof defaultOptions;

export function EventsHistoryContextMenu({ params, setParams }: { params: PanelParams, setParams: ParamsSetter }) {
	const { columns } = useContext(MainTableContext);
	const { samples } = useContext(SampleContext);
	const { shownColumns } = useEventsSettings();
	const cur = { ...defaultOptions, ...params.statParams } as HistoryOptions;
	const { historySeries: series } = cur;

	const set = <T extends keyof HistoryOptions>(k: T, val: HistoryOptions[T]) =>
		setParams('statParams', { [k]: val });
	const setSample = (i: number, val: StatSeries['sample']) =>
		set('historySeries', series.toSpliced(i, 1, { ...series[i], sample: val }));
	const setColumn = (i: number, val: StatSeries['column']) =>
		set('historySeries', series.toSpliced(i, 1, { ...series[i], column: val }));
	const Checkbox = ({ text, k }: { text: string, k: keyof HistoryOptions }) =>
		<label>{text}<input type='checkbox' style={{ paddingLeft: 4 }}
			checked={cur[k] as boolean} onChange={e => set(k, e.target.checked)}/></label>;
	
	const columnOpts = columns.filter(c =>
		(['integer', 'real', 'enum'].includes(c.type) && shownColumns?.includes(c.id))
			|| series.some(p => p.column === c.id));
	
	return <div className='Group'>
		{([0, 1, 2, 3, 4] as const).map(i => <div key={i} className='Row' style={{ paddingRight: 4 }}>
			<span title='Reset' style={{ color: color(seriesColors[i]), cursor: 'pointer', userSelect: 'none' }}
				onClick={() => set('historySeries', series.toSpliced(i, 1, { column: null, sample: '<current>' }))}>#{i}</span>
			<div><select title='Column' className='Borderless' style={{ width: '10em',
				color: series[i].column == null ? color('text-dark') : 'unset' }}
			value={series[i].column ?? '__none'} onChange={e => setColumn(i, e.target.value === '__none' ? null : e.target.value)}>
				<option value='__none'>&lt;none&gt;</option>
				<option value='<count>'>&lt;count&gt;</option>
				{columnOpts.map(({ id, fullName }) => <option key={id} value={id}>{fullName}</option>)}
			</select>:
			<select title='Sample (none = all events)' className='Borderless' style={{ width: '7em', marginLeft: 1,
				color: series[i].sample === '<current>' ? color('text-dark') : 'unset' }}
			value={series[i].sample} onChange={e => setSample(i, e.target.value)}>
				<option value='<none>'>&lt;none&gt;</option>
				<option value='<current>'>&lt;current&gt;</option>
				{samples.map(({ id, name }) => <option key={id} value={id.toString()}>{name}</option>)}
			</select></div>
		</div>)}
		<div className='Row'>
			<Checkbox text='Y label' k='showYLabel'/>
			<div>Window:<select className='Borderless' style={{ margin: '0 4px' }}
				value={cur.window} onChange={e => set('window', e.target.value as any)}>
				{Object.keys(windowOptions).map(k => <option key={k} value={k}>{k}</option>)}
			</select></div>
		</div>

		<div style={{ textAlign: 'right' }}>
			<span className='TextButton' title='Reset' style={{ userSelect: 'none', cursor: 'pointer' }}
				onClick={() => setParams('statParams', { forceLeft: null, forceRight: null })}>Limit years:</span>
			<NumberInput style={{ width: '4em', marginLeft: 4, padding: 0 }}
				min={1950} max={new Date().getUTCFullYear()}
				value={cur.forceLeft} onChange={val => set('forceLeft', val)} allowNull={true}/>
			;<NumberInput style={{ width: '4em', margin: '0 4px 0 2px', padding: 0 }}
				min={1950} max={new Date().getUTCFullYear()}
				value={cur.forceRight} onChange={val => set('forceRight', val)} allowNull={true}/>
		</div>
	</div>;
}

export default function EventsHistory() {
	const { data: currentData, samples: samplesList } = useContext(SampleContext);
	const { showGrid, showMarkers, showLegend } = useEventsSettings();
	const layoutParams = useContext(LayoutContext)?.params.statParams;
	const { columns, data: allData } = useContext(MainTableContext);

	const params = useMemo(() => ({ ...defaultOptions, ...layoutParams }), [layoutParams]) as HistoryOptions;

	const defaultPos: DefaultPosition = (u, { width }) => ({
		x: (u.bbox.left + u.bbox.width - scaled(width)) / scaled(1) + 6, 
		y: 3 });
	const [legendPos, legendSize, handleDragLegend] = usePlotOverlayPosition(defaultPos);

	const { data, options } = useMemo(() => {
		const window = windowOptions[params.window];
		const timeColIdx = columns.findIndex(c => c.name === 'time');
		const firstEvent = allData[0][timeColIdx] as Date;
		const lastEvent = params.forceRight ? new Date(Date.UTC(params.forceRight, 0, 1)) : allData.at(-1)![timeColIdx] as Date;
		const firstMonth = params.forceLeft ? (params.forceLeft - 1970) * 12 : Math.floor((
			(firstEvent.getUTCFullYear() - 1970) * 12 + firstEvent.getUTCMonth()) / window) * window;
		
		const time = [];
		const values = params.historySeries.map(s => [] as number[]);
		const samples = params.historySeries.map(({ sample }) =>
			sample === '<none>' ? allData : sample === '<current>' ? currentData :
 				applySample(allData, samplesList.find(s => s.id.toString() === sample) ?? null, columns));
		
		for (let bin=0; bin < 999; ++bin) {
			const start = Date.UTC(1970, firstMonth + bin * window, 1);
			const end = Date.UTC(1970, firstMonth + bin * window + window, 1);

			if (start >= lastEvent.getTime())
				break;
			time.push((start + end) / 2 / 1e3);

			for (const [i, { column }] of params.historySeries.entries()) {
				if (column == null)
					continue;
				const batch = samples[i].filter(row => start <= (row[timeColIdx] as Date).getTime() &&
					(row[timeColIdx] as Date).getTime() < end);

				values[i].push(batch.length);
			}
		}

		return {
			data: [time, ...values],
			options: () => {
				const ch = measureDigit().width;
				const columnNames = params.historySeries.map(({ column }) => column === '<count>' ?
					'count' : columns.find(cc => cc.id === column)?.fullName);
				const sampleNames = params.historySeries.map(({ sample: id }) =>
					'<current>' === id ? '' : '<none>' === id ? ' (all)' :
						(' of ' + (samplesList.find(s => s.id.toString() === id)?.name ?? 'UNKNOWN')));
				return {
					cursor: { show: false },
					padding: [scaled(12), scaled(16), 0, 0],
					hooks: {
						draw: [
							drawCustomLegend({ showLegend }, legendPos, legendSize, defaultPos)
						],
						ready: [ handleDragLegend ]
					},
					axes: [{
						...axisDefaults(showGrid),
						space: 5 * ch,
						size: measureDigit().height + scaled(12),
					}, {
						...axisDefaults(showGrid),
						incrs: [1, 2, 3, 4, 5, 10, 15, 20, 30, 50]
					}],
					series: [
						{}, seriesColors.map((col, i) => ({
							show: columnNames[i],
							legend: `${columnNames[i]}${sampleNames[i]}`,
							stroke: color(col),
							width: scaled(1),
							marker: seriesMarkers[i],
							points: {
								show: showMarkers,
								stroke: color(col),
								fill: color(col),
								width: 0,
								paths: markersPaths(seriesMarkers[i], 8)
							},
						}))
					].flat()
				} as Omit<uPlot.Options, 'width'|'height'>;
			}
		};
	}, [params, columns, allData, currentData, samplesList, showLegend, legendPos, legendSize, handleDragLegend, showGrid, showMarkers]);

	return <ExportableUplot {...{ options, data }}/>;
}