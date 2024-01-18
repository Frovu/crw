import { useContext, useMemo } from 'react';
import { useEventsSettings, type ColumnDef, type PanelParams, MainTableContext, SampleContext } from '../events/events';
import { LayoutContext, type ParamsSetter } from '../layout';
import type uPlot from 'uplot';
import { axisDefaults, measureDigit, scaled } from './plotUtil';
import { color } from '../app';
import { ExportableUplot } from '../events/ExportPlot';
import { NumberInput } from '../Utility';

const windowOptions = { '2 years': 24, '1 year': 12, '6 months': 6, '2 months': 2, '1 month': 1 } as const;

type HistorySeries = {
	sample: '<none>' | '<current>' | string,
	column: '<count>' | ColumnDef,
};

const defaultOptions = {
	window: '1 year' as keyof typeof windowOptions,
	forceLeft: null as null | number,
	forceRight: null as null | number,
};

export type HistoryOptions = typeof defaultOptions;

export function EventsHistoryContextMenu({ params, setParams }: { params: PanelParams, setParams: ParamsSetter }) {
	const cur = { ...defaultOptions, ...params.statParams } as HistoryOptions;
	const set = <T extends keyof HistoryOptions>(k: T, val: HistoryOptions[T]) =>
		setParams('statParams', { [k]: val });
	
	return <div className='Group'>
		<div>
			<span>Window:<select className='Borderless' style={{ margin: '0 4px' }}
				value={cur.window} onChange={e => set('window', e.target.value as any)}>
				{Object.keys(windowOptions).map(k => <option key={k} value={k}>{k}</option>)}
			</select></span>
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
	const { showGrid, showLegend } = useEventsSettings();
	const layoutParams = useContext(LayoutContext)?.params.statParams;
	const { ...params } =  { ...defaultOptions, ...layoutParams } as HistoryOptions;
	const { columns, data: allData } = useContext(MainTableContext);

	const { data, options } = useMemo(() => {
		const window = windowOptions[params.window];
		const timeColIdx = columns.findIndex(c => c.name === 'time');
		const firstEvent = allData[0][timeColIdx] as Date;
		const lastEvent = params.forceRight ? new Date(Date.UTC(params.forceRight, 0, 1)) : allData.at(-1)![timeColIdx] as Date;
		const firstMonth = params.forceLeft ? (params.forceLeft - 1970) * 12 : Math.floor((
			(firstEvent.getUTCFullYear() - 1970) * 12 + firstEvent.getUTCMonth()) / window) * window;
		
		const time = [];
		const values = [];
		for (let i=0;; ++i) {
			const start = Date.UTC(1970, firstMonth + i * window, 1);
			const end = Date.UTC(1970, firstMonth + i * window + window, 1);

			if (start >= lastEvent.getTime())
				break;

			const batch = allData.filter(row => start <= (row[timeColIdx] as Date).getTime() &&
				(row[timeColIdx] as Date).getTime() < end);
			time.push((start + end) / 2 / 1e3);
			values.push(batch.length);
		}

		console.log(time.map(a => new Date(a * 1e3)))
		return {
			data: [time, values],
			options: () => {
				const ch = measureDigit().width;
				return {
					cursor: { show: false },
					padding: [scaled(12), scaled(16), 0, 0],
					axes: [{
						...axisDefaults(showGrid),
						// values: (u, vals) => vals.map(v => new Date(v * 1e3).getUTCMonth() === 1
						//  ? new Date(v * 1e3).getUTCFullYear() : ''),
						space: 5 * ch,
						size: measureDigit().height + scaled(12),
					}, {
						...axisDefaults(showGrid)
					}],
					series: [
						{}, {
							stroke: color('green'),
							points: { show: false },
							width: scaled(2)
						}
					]
				} as Omit<uPlot.Options, 'width'|'height'>;
			}
		};
	}, [allData, columns, params, showGrid]);

	return <ExportableUplot {...{ options, data }}/>;
}