import { useContext, useMemo } from 'react';
import uPlot from 'uplot';
import { axisDefaults, color, font, getFontSize, measureDigit, scaled } from './plotUtil';
import { ColumnDef, MainTableContext, PanelParams, SampleContext, findColumn, useEventsSettings } from '../events/events';
import { ExportableUplot } from '../events/ExportPlot';
import { LayoutContext, ParamsSetter } from '../Layout';
import { applySample } from '../events/sample';
import { drawCustomLabels } from './BasicPlot';

const colors = ['green', 'purple', 'magenta'] as const;
const yScaleOptions = ['count', 'log', '%'] as const;
const columnKeys = ['column0', 'column1', 'column2'] as const;
const sampleKeys = ['sample0', 'sample1', 'sample2'] as const;

export type HistogramParams = {
	binCount: number,
	forceMin: number | null,
	forceMax: number | null,
	drawMean: boolean,
	drawMedian: boolean,
	yScale: typeof yScaleOptions[number],
	sample0: string,
	column0: string | null,
	sample1: string,
	column1: string | null,
	sample2: string,
	column2: string | null,
};

export const defaultHistOptions: (columns: ColumnDef[]) => HistogramParams = columns => ({
	binCount: 16,
	forceMin: null,
	forceMax: null,
	yScale: 'count',
	sample0: '<current>',
	sample1: '<current>',
	sample2: '<current>',
	column0: findColumn(columns, 'duration')?.id ?? null,
	column1: null,
	column2: null,
	drawMean: true,
	drawMedian: false
});

export function HistogramContextMenu({ params, setParams }: { params: PanelParams, setParams: ParamsSetter }) {
	const { columns } = useContext(MainTableContext);
	const { samples } = useContext(SampleContext);
	const { shownColumns } = useEventsSettings();
	const cur = { ...defaultHistOptions(columns), ...params.statParams };
	const columnOpts = columns.filter(c => (['integer', 'real'].includes(c.type) && shownColumns?.includes(c.id))
		|| (['column0', 'column1', 'column2'] as const).some(p => cur[p] === c.id));

	const set = <T extends keyof HistogramParams>(k: T, val: HistogramParams[T]) =>
		setParams('statParams', { [k]: val });
	const Checkbox = ({ text, k }: { text: string, k: keyof HistogramParams }) =>
		<label>{text}<input type='checkbox' style={{ paddingLeft: 4 }}
			checked={cur[k] as boolean} onChange={e => set(k, e.target.checked)}/></label>;

	return <div className='Group'>
		{([0, 1, 2] as const).map(i => <div key={i} className='Row' style={{ paddingRight: 4 }}>
			<span title='Reset' style={{ color: color(colors[i]), cursor: 'pointer' }}
				onClick={() => {set(columnKeys[i], null); set(sampleKeys[i], '<current>');}}>#{i}</span>
			<div><select title='Column' className='Borderless' style={{ width: '10em',
				color: cur[columnKeys[i]] == null ? color('text-dark') : 'unset' }}
			value={cur[columnKeys[i]] ?? '__none'} onChange={e => set(columnKeys[i], e.target.value === '__none' ? null : e.target.value)}>
				<option value='__none'>&lt;none&gt;</option>
				{columnOpts.map(({ id, fullName }) => <option key={id} value={id}>{fullName}</option>)}
			</select>:
			<select title='Sample (none = all events)' className='Borderless' style={{ width: '7em', marginLeft: 1,
				color: cur[sampleKeys[i]] === '<current>' ? color('text-dark') : 'unset' }}
			value={cur[sampleKeys[i]]} onChange={e => set(sampleKeys[i], e.target.value)}>
				<option value='<none>'>&lt;none&gt;</option>
				<option value='<current>'>&lt;current&gt;</option>
				{samples.map(({ id, name }) => <option key={id} value={id.toString()}>{name}</option>)}
			</select></div>
		</div>)}
		<div className='Row'>
			<div>Y:<select className='Borderless' style={{ width: '5em', marginLeft: 4, padding: 0 }}
				value={cur.yScale} onChange={e => set('yScale', e.target.value as any)}>
				{yScaleOptions.map(o => <option key={o} value={o}>{o}</option>)}
			</select></div>
			<div style={{ paddingLeft: 4 }}>Bin count:<input type='number' min='2' max='9999'
				style={{ width: '4em', margin: '0 4px', padding: 0 }}
				value={cur.binCount} onChange={e => set('binCount', e.target.valueAsNumber)}/></div>
		</div>
		<div style={{ textAlign: 'right' }}>
			<span className='TextButton' title='Reset' style={{ userSelect: 'none', cursor: 'pointer' }}
				onClick={() => setParams('statParams', { forceMin: null, forceMax: null })}>Limits:</span>
			<input type='text' style={{ width: '4em', margin: '0 4px', padding: 0 }}
				value={cur.forceMin ?? ''} onChange={e => set('forceMin', e.target.value ? parseFloat(e.target.value) : null)}/>
			&lt;= X &lt;<input type='text' style={{ width: '4em', margin: '0 4px', padding: 0 }}
				value={cur.forceMax ?? ''} onChange={e => set('forceMax', e.target.value ? parseFloat(e.target.value) : null)}/>
		</div>
		<div className='Row'>
			<Checkbox text='Draw mean' k='drawMean'/>
			<Checkbox text=' median' k='drawMedian'/>
		</div>
	</div>;
}

export default function HistogramPlot() {
	const { data: allData, columns } = useContext(MainTableContext);
	const layoutParams = useContext(LayoutContext)?.params.statParams;
	const { showGrid } = useEventsSettings();
	const { samples: samplesList, data: sampleData } = useContext(SampleContext);

	const hist = useMemo(() => {
		const options = { ...defaultHistOptions(columns), ...layoutParams };

		const cols = [0, 1, 2].map(i => columns.findIndex(c => c.id === options['column'+i as keyof HistogramParams]));
		const allSamples = [0, 1, 2].map(i => {
			const sampleId = options['sample'+i as 'sample0'|'sample1'|'sample2'];
			const colIdx = cols[i];
			if (!sampleId || colIdx < 0) return [];
			const column = columns[colIdx];
			const data = sampleId === '<current>' ? sampleData : sampleId === '<none>' ? allData :
				applySample(allData, samplesList.find(s => s.id.toString() === sampleId) ?? null, columns);
			return data.map(row => row[colIdx]).filter(val => val != null || column.type === 'enum');
		});
		const firstIdx = allSamples.findIndex(s => s.length);
		if (firstIdx < 0) return null;
		const column = columns[cols[firstIdx]];
		const enumMode = !!column.enum;
		const samples = enumMode ? [allSamples[firstIdx].map(v => !v ? 0 : (column.enum!.indexOf(v as any) + 1))] : allSamples;
		const averages = {
			mean: options.drawMean && samples.map(smpl => smpl.length ? (smpl as any[]).reduce((a, b) => a + (b ?? 0), 0) / smpl.length : null),
			median: options.drawMedian && samples.map(smpl => {
				const s = smpl.sort() as any, mid = Math.floor(smpl.length / 2);
				return s.length % 2 === 0 ? s[mid] : (s[mid] + s[mid + 1]) / 2;
			})
		} as {[key: string]: (number | null)[]};

		const everything = samples.flat() as number[];
		const min = options.forceMin ?? Math.min.apply(null, everything);
		let max = options.forceMax ?? Math.max.apply(null, everything);
		const binCount = enumMode ? column.enum!.length + (everything.includes(0) ? 1 : 0) : options.binCount;
		if (options.forceMax == null) {
			const countMax = everything.reduce((a, b) => b === max ? a + 1 : a, 0);
			if (countMax > 1) // workaround for inclusive intervals
				max += (max - min) / (binCount - 1);
		}
		const binSize = (max - min) / binCount;
		if (min === max || !binCount) return null;
		const samplesBins = samples.map(sample => {
			if (!sample.length) return null;
			const bins = Array(binCount).fill(0);
			for (const val of sample) {
				const bin = Math.floor(((val as number) - min) / binSize);
				if (bin >= 0 && bin < binCount)
					++bins[bin];
			}
			return bins;
		});
		// const maxLength = Math.max.apply(null, samples.map(s => s?.length || 0)); 
		const transformed = samplesBins.map((bins, i) => options.yScale === '%' ? bins?.map(b => b / samples[i].length) : bins).filter(b => b);
		const binsValues = transformed[0]?.map((v,i) => min + i*binSize) || [];

		const drawAverages = (scale: number, fnt: string) => (u: uPlot) => {
			for (const what in averages) {
				if (!averages[what]) continue;
				for (const [i, value] of averages[what].entries()) {
					if (value == null) continue;
					const x = u.valToPos(value, 'x', true);
					const margin = scale * (what === 'mean' ? -8 : 2);
					const text = what === 'mean' ? 'm' : 'd';
					u.ctx.save();
					u.ctx.fillStyle = u.ctx.strokeStyle = color(colors[i], what === 'mean' ? 1 : .8);
					u.ctx.font = fnt;
					u.ctx.textBaseline = 'top';
					u.ctx.textAlign = 'left';
					u.ctx.lineWidth = scale * 2 * devicePixelRatio;
					u.ctx.beginPath();
					u.ctx.moveTo(x, u.bbox.top + margin + scale * 14);
					u.ctx.lineTo(x, u.bbox.top + u.bbox.height);
					u.ctx.stroke();
					u.ctx.lineWidth = scale * 1 * devicePixelRatio;
					u.ctx.strokeStyle = color('text');
					u.ctx.stroke();
					u.ctx.fillText(text, x - scale * 3, u.bbox.top + margin);
					u.ctx.restore();
				} }
		};

		const colNames = [0, 1, 2].map(i => options['column'+i as keyof HistogramParams])
			.filter((c, i) => samplesBins[i])
			.map(c => columns.find(cc => cc.id === c)?.fullName);

		return {
			options: () => ({
				padding: [12, 8, 2, 0].map(p => scaled(p)) as any,
				legend: { show: false },
				cursor: { show: false, drag: { x: false, y: false, setScale: false } },
				hooks: { draw: [ drawAverages(scaled(1), font(14, true)), drawCustomLabels() ] },
				axes: [ {
					...axisDefaults(showGrid),
					size: scaled(10) + getFontSize(),
					space: getFontSize() * 3,
					labelSize: getFontSize(),
					fullLabel: colNames.join(', '),
					label: '',
					values: (u, vals) => vals.map(v => v % 1 === 0 ? ('   ' + v.toFixed()) : ''),
					...(enumMode && {
						values: (u, vals) => vals.map(v => '     ' + ((v != null && v % 1 === 0) ? ['N/A', ...column.enum!][v] : ''))
					}),
				}, {
					...axisDefaults(showGrid),
					values: (u, vals) => vals.map(v => v && (options.yScale === '%' ? (v*100).toFixed(0) + '%' : v.toFixed())),
					size: measureDigit().width * 4 + scaled(12),
					space: getFontSize() * 3
				}, ],
				scales: {
					x: {
						time: false,
						range: () => [min-binSize/4, max + binSize/4 * (enumMode ? -1 : 1) ]
					}, y: {
						distr: options.yScale === 'log' ? 3 : 1
					} },
				series: [
					{}, ...[{
						label: colNames[0],
						stroke: color(colors[0]),
						fill: color(colors[0], .8),
						width: 0,
						points: { show: false },
						paths: uPlot.paths.bars!({ size: [.8, scaled(64)], align: 1 })
					}, {
						label: colNames[1],
						stroke: color(colors[1]),
						fill: color(colors[1]),
						width: 0,
						points: { show: false },
						paths: uPlot.paths.bars!({ size: [.5, scaled(64)], align: 1 })
					}, {
						label: colNames[2],
						stroke: color(colors[2]),
						fill: color(colors[2]),
						width: 0,
						points: { show: false },
						paths: uPlot.paths.bars!({ size: [.25, scaled(64)], align: 1 })
					}].filter((ser, i) => samplesBins[i])
				]
			}) as Omit<uPlot.Options, 'width'|'height'>,
			data: [binsValues, ...transformed] as any
		};
	}, [layoutParams, columns, sampleData, allData, samplesList, showGrid]);

	if (!hist) return <div className='Center'>NOT ENOUGH DATA</div>;
	return <ExportableUplot {...{ ...hist }}/>;
}