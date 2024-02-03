import { useContext, useMemo } from 'react';
import uPlot from 'uplot';
import { type DefaultPosition, axisDefaults, color, font, getFontSize, measureDigit, scaled, usePlotOverlayPosition } from './plotUtil';
import { type ColumnDef, MainTableContext, type PanelParams, SampleContext, findColumn, useEventsSettings, type Value } from '../events/events';
import { ExportableUplot } from '../events/ExportPlot';
import { applySample } from '../events/sample';
import { drawCustomLabels, drawCustomLegend, type CustomAxis, tooltipPlugin } from './basicPlot';
import { LayoutContext, type ParamsSetter } from '../layout';
import { NumberInput } from '../Utility';

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
	showYLabel: boolean,
	showResiduals: boolean,
	yScale: typeof yScaleOptions[number],
	sample0: string,
	column0: string | null,
	sample1: string,
	column1: string | null,
	sample2: string,
	column2: string | null,
};

const defaultHistOptions: (columns: ColumnDef[]) => HistogramParams = columns => ({
	binCount: 16,
	forceMin: null,
	forceMax: null,
	yScale: 'count',
	showYLabel: false,
	showResiduals: true,
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
	const columnOpts = columns.filter(c => (['integer', 'real', 'enum'].includes(c.type) && shownColumns?.includes(c.id))
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
			<NumberInput style={{ width: '4em', margin: '0 4px', padding: 0 }}
				value={cur.forceMin} onChange={val => set('forceMin', val)} allowNull={true}/>
			&lt;= X &lt;<NumberInput style={{ width: '4em', margin: '0 4px', padding: 0 }}
				value={cur.forceMax} onChange={val => set('forceMax', val)} allowNull={true}/>
		</div>
		<div className='Row'>
			<Checkbox text='Show Y label' k='showYLabel'/>
			<Checkbox text=' mean' k='drawMean'/>
			<Checkbox text=' median' k='drawMedian'/>
		</div>
		<div className='Row'>
			<Checkbox text='Show residual counts' k='showResiduals'/>
		</div>
	</div>;
}

function drawResiduals(options: HistogramParams, samples: number[][], min: number, max: number) {
	const left  = samples.map(smp => smp.filter(v => v <  min).length);
	const right = samples.map(smp => smp.filter(v => v >= max).length);

	const scale = scaled(1);
	const ch = measureDigit().width;
	const lh = getFontSize();
	const px = (a: number) => scale * a * devicePixelRatio;

	return (u: uPlot) => {
		if (!options.showResiduals)
			return;
		for (const [which, values] of [['left', left], ['right', right]] as const) {
			if (!values.find(v => v > 0))
				continue;
			const vals = options.yScale === '%' ?
				values.map((v, i) => Math.round(v / samples[i].length * 1000) / 10) : values;

			const height = px(5) + values.filter(v => v > 0).length * lh * devicePixelRatio;
			const width = px(6) + (Math.max.apply(null, vals.map(v => v.toString().length)) * ch + ch) * devicePixelRatio;

			const x0 = u.bbox.left + (which === 'right' ? u.bbox.width - width : 0);
			const y0 = u.bbox.top + u.height * 1 / 3 - height;

			u.ctx.save();
			u.ctx.lineWidth = px(1);
			u.ctx.strokeStyle = color('text-dark');
			u.ctx.fillStyle = color('bg');
			u.ctx.fillRect(x0, y0, width, height);
			u.ctx.strokeRect(x0, y0, width, height);
			u.ctx.textAlign = 'left';
			u.ctx.lineCap = 'butt';
			u.ctx.textBaseline = 'top';

			const x = x0 + px(2);
			let y = y0 + px(3);
			for (const [i, val] of values.entries()) {
				if (val <= 0)
					continue;

				u.ctx.fillStyle = color(colors[i]);
				u.ctx.fillText('+' + val.toString(), x, y);
				y += lh;
			}
			u.ctx.restore();
		}
	};
}

function drawAverages(options: HistogramParams, samples: Value[][]) {
	const scale = scaled(1);
	const fnt = font(14, true);
	const px = (a: number) => scale * a * devicePixelRatio;
	const averages = {
		mean: options.drawMean && samples.map(smpl => smpl.length ? (smpl as any[]).reduce((a, b) => a + (b ?? 0), 0) / smpl.length : null),
		median: options.drawMedian && samples.map(smpl => {
			const s = smpl.sort((a: any, b: any) => a - b) as any, mid = Math.floor(smpl.length / 2);
			return s.length % 2 === 0 ? s[mid] : (s[mid] + s[mid + 1]) / 2;
		})
	} as {[key: string]: (number | null)[]};

	return (u: uPlot) => {
		for (const what in averages) {
			if (!averages[what]) continue;
			for (const [i, value] of averages[what].entries()) {
				if (value == null) continue;
				const x = u.valToPos(value, 'x', true);
				const margin = px(what === 'mean' ? -10 : 1);
				const text = what === 'mean' ? 'a' : 'm';
				u.ctx.save();
				u.ctx.fillStyle = u.ctx.strokeStyle = color(colors[i], what === 'mean' ? 1 : .8);
				u.ctx.font = fnt;
				u.ctx.textBaseline = 'top';
				u.ctx.textAlign = 'left';
				u.ctx.lineWidth = px(2);
				u.ctx.beginPath();
				u.ctx.moveTo(x, u.bbox.top + margin + px(14));
				u.ctx.lineTo(x, u.bbox.top + u.bbox.height);
				u.ctx.stroke();
				u.ctx.lineWidth = px(1);
				u.ctx.strokeStyle = color('text');
				u.ctx.stroke();
				u.ctx.fillText(text, x - scale * 3, u.bbox.top + margin);
				u.ctx.restore();
			} }
	};
} 

export default function HistogramPlot() {
	const { data: allData, columns } = useContext(MainTableContext);
	const layoutParams = useContext(LayoutContext)?.params.statParams;
	const { showGrid, showLegend } = useEventsSettings();
	const { samples: samplesList, data: sampleData } = useContext(SampleContext);

	const defaultPos: DefaultPosition = (u, { width }) => ({
		x: (u.bbox.left + u.bbox.width - scaled(width)) / scaled(1) + 6, 
		y: 3 });
	const [legendPos, legendSize, handleDragLegend] = usePlotOverlayPosition(defaultPos);

	const hist = useMemo(() => {
		const options = { ...defaultHistOptions(columns), ...layoutParams };
		const { yScale } = options;

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

		const everything = samples.flat() as number[];
		const min = options.forceMin ?? Math.min.apply(null, everything);
		let max = options.forceMax ?? Math.max.apply(null, everything) + 1;
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
			return bins as number[];
		});
		// const maxLength = Math.max.apply(null, samples.map(s => s?.length || 0)); 
		const transformed = samplesBins.map((bins, i) => yScale === '%' ? bins?.map(b => b / samples[i].length)! : bins!).filter(b => b);
		const binsValues = transformed[0]?.map((v, i) => min + (i + (enumMode ? 0 : .5)) * binSize) || [];

		const colNames = [0, 1, 2].map(i => options['column'+i as keyof HistogramParams])
			.map(c => columns.find(cc => cc.id === c)?.fullName);
		const sampleNames = [0, 1, 2].map(i => options['sample'+i as 'sample0'|'sample1'|'sample2'])
			.map(id => ['<current>', '<none>'].includes(id) ? '' : 
				(' of ' + (samplesList.find(s => s.id.toString() === id)?.name ?? 'UNKNOWN')));

		// try to prevent short bars from disappearing
		const highest = Math.max.apply(null, transformed.flat());
		const elevated = transformed.map(smp => smp.map(c => c === 0 ? 0 : Math.max(c, highest / 256)));

		const yLabel = yScale === 'log' ? 'log( events count )'
					 : yScale === '%' ? 'events fraction, %' : 'events count';
		return {
			options: () => {
				const scale = scaled(1);
				const ch = measureDigit().width;
				return {
					padding: [12, 14 + (max > 999 ? 4 : 0), 0, 0].map(p => scaled(p)) as any,
					legend: { show: false },
					focus: { alpha: .5 },
					cursor: { focus: { prox: 64 }, drag: { x: false, y: false, setScale: false }, points: { show: false } },
					hooks: { draw: [
						drawAverages(options, samples),
						drawCustomLabels({ showLegend }),
						enumMode ? () => {} : drawResiduals(options, samples as any, min, max),
						drawCustomLegend({ showLegend }, legendPos, legendSize, defaultPos),
					], ready: [
						handleDragLegend
					] },
					plugins: [ tooltipPlugin({
						html: (u, sidx, i) => 
							`${Math.round(u.data[0][i] * 100) / 100} ± ${Math.round(binSize / 2 * 100) / 100};`
							+ `<span style="color: ${(u.series[sidx].stroke as any)()}"> `
							+ (Math.round(u.data[sidx][i]! * 100) / (yScale === '%' ? 1 : 100)).toString() + (yScale === '%' ? ' %' : ' events') + '</span>'
					}) ],
					axes: [ {
						...axisDefaults(showGrid),
						size: scaled(12) + getFontSize(),
						space: getFontSize() * 3,
						labelSize: getFontSize(),
						fullLabel: colNames.filter(a => a && a.length > 0).join(', '),
						label: '',
						gap: scaled(2),
						values: (u, vals) => vals.map(v => v),
						...(enumMode && {
							values: (u, vals) => vals.map(v => (v != null && v % 1 === 0) ? ['N/A', ...column.enum!][v] : '')
						}),
					}, {
						...axisDefaults(showGrid),
						values: (u, vals) => vals.map(v => v && (yScale === '%' ?
							(v*100).toFixed(0) + (options.showYLabel ? '' : '%') : v.toFixed())),
						gap: scaled(2),
						fullLabel: options.showYLabel ? yLabel : '',
						label: options.showYLabel ? '' : undefined,
						labelSize: getFontSize() + scaled(3),
						size: (u, values) => scale * 12 + ch *
							(values ? Math.max.apply(null, values.map(v => v?.toString().length ?? 0)) : 4),
						space: getFontSize() * 3
					} as CustomAxis, ],
					scales: {
						x: {
							time: false,
							range: () => !enumMode ? [min, max] : [min-binSize/2, max + binSize/2 * (enumMode ? -1 : 1) ]
						}, y: {
							distr: yScale === 'log' ? 3 : 1
						} },
					series: [
						{}, ...[{
							bars: true,
							label: colNames[0],
							legend: `${colNames[0]}${sampleNames[0]}`,
							stroke: color(colors[0]),
							fill: color(colors[0], .8),
							width: 0,
							points: { show: false },
							paths: uPlot.paths.bars!({ size: [.8, scaled(64)] })
						}, {
							bars: true,
							label: colNames[1],
							legend: `${colNames[1]}${sampleNames[1]}`,
							stroke: color(colors[1]),
							fill: color(colors[1]),
							width: 0,
							points: { show: false },
							paths: uPlot.paths.bars!({ size: [.5, scaled(64)] })
						}, {
							bars: true,
							label: colNames[2],
							legend: `${colNames[2]}${sampleNames[2]}`,
							stroke: color(colors[2]),
							fill: color(colors[2]),
							width: 0,
							points: { show: false },
							paths: uPlot.paths.bars!({ size: [.25, scaled(64)] })
						}].filter((ser, i) => samplesBins[i])
					]
				} as Omit<uPlot.Options, 'width'|'height'>; },
			data: [binsValues, ...elevated] as any
		};
	}, [columns, layoutParams, sampleData, allData, samplesList, showLegend, legendPos, legendSize, handleDragLegend, showGrid]);

	if (!hist) return <div className='Center'>NOT ENOUGH DATA</div>;
	return <ExportableUplot {...{ ...hist }}/>;
}