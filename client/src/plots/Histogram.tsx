import { useContext, useMemo, useState } from 'react';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import { useSize } from '../util';
import { axisDefaults, clickDownloadPlot, color, font } from './plotUtil';
import { MainTableContext, SampleContext, useEventsSettings } from '../events/events';

const colors = ['magenta', 'acid', 'cyan'];
const yScaleOptions = ['count', 'log', '%'] as const;

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

export const defaultHistOptions: HistogramParams = {
	binCount: 16,
	forceMin: null,
	forceMax: null,
	yScale: 'count',
	sample0: 'current',
	sample1: 'current',
	sample2: 'current',
	column0: 'fe_v_max',
	column1: null,
	column2: null,
	drawMean: false,
	drawMedian: false
};

export default function HistogramPlot() {
	const { data: allData, columns } = useContext(MainTableContext);
	const { showGrid } = useEventsSettings();
	const { data: sampleData, apply: applySample } = useContext(SampleContext);

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);
	const options = defaultHistOptions

	const hist = useMemo(() => {
		const cols = [0, 1, 2].map(i => columns.findIndex(c => c.id === options['column'+i as keyof HistogramParams]));
		const allSamples = [0, 1, 2].map(i => {
			const sampleId = options['sample'+i as keyof HistogramParams];
			const colIdx = cols[i];
			if (!sampleId || colIdx < 0) return [];
			const column = columns[colIdx];
			
			const data = sampleId === 'current' ? sampleData : sampleId === 'none' ? allData :
				applySample(allData, sampleId as number);
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
		const transformed = samplesBins.filter(b => b).map((bins, i) => options.yScale === '%' ? bins!.map(b => b / samples[i].length) : bins);
		const binsValues = transformed[0]?.map((v,i) => min + i*binSize) || [];

		const drawAverages = (u: uPlot) => {
			for (const what in averages) {
				if (!averages[what]) continue;
				for (const [i, value] of averages[what].entries()) {
					if (value == null) continue;
					const x = u.valToPos(value, 'x', true);
					const margin = what === 'mean' ? 6 : -8;
					u.ctx.save();
					u.ctx.fillStyle = u.ctx.strokeStyle = color(colors[i], what === 'mean' ? 1 : .6);
					u.ctx.font = font(12, true);
					u.ctx.textBaseline = 'top';
					u.ctx.textAlign = 'left';
					u.ctx.lineWidth = 3 * devicePixelRatio;
					u.ctx.beginPath();
					u.ctx.moveTo(x, u.bbox.top + margin + 2);
					u.ctx.lineTo(x, u.bbox.top + u.bbox.height);
					u.ctx.stroke();
					u.ctx.fillText(what, x + 5, u.bbox.top + margin);
					u.ctx.restore();
				}
			}
		};
		
		return (asize: { width: number, height: number }) => ({
			options: {
				...asize,
				padding: [10, 4, 0, 0],
				legend: { show: false },
				cursor: { show: false, drag: { x: false, y: false, setScale: false } },
				hooks: {
					draw: [ drawAverages ]
				},
				axes: [
					{
						...axisDefaults(showGrid),
						size: 30,
						space: 64,
						labelSize: 20,
						label: [0, 1, 2].map(i => options['column'+i as keyof HistogramParams]).filter((c, i) => samplesBins[i])
							.map(c => columns.find(cc => cc.id === c)?.fullName).join(', '),
						values: (u, vals) => vals.map(v => v % 1 === 0 ? ('   ' + v.toFixed()) : ''),
						...(enumMode && {
							values: (u, vals) => vals.map(v => '     ' + ((v != null && v % 1 === 0) ? ['N/A', ...column.enum!][v] : ''))
						}),
					},
					{
						...axisDefaults(showGrid),
						values: (u, vals) => vals.map(v => v && (options.yScale === '%' ? (v*100).toFixed(0) + ' %' : v.toFixed())),
						size: 56,
						space: 48
					},
				],
				scales: {
					x: {
						time: false,
						range: () => [min-binSize/4, max + binSize/4 * (enumMode ? -1 : 1) ]
					},
					y: {
						distr: options.yScale === 'log' ? 3 : 1
					}
		
				},
				series: [
					{},
					...[{
						stroke: color(colors[0]),
						fill: color(colors[0], .8),
						width: 0,
						points: { show: false },
						paths: uPlot.paths.bars!({ size: [.8, 64], align: 1 })
					},
					{
						stroke: color(colors[1]),
						fill: color(colors[1]),
						width: 0,
						points: { show: false },
						paths: uPlot.paths.bars!({ size: [.4, 64], align: 1 })
					},
					{
						stroke: color(colors[2]),
						fill: color(colors[2]),
						width: 0,
						points: { show: false },
						paths: uPlot.paths.bars!({ size: [.2, 64], align: 1 })
					}].filter((ser, i) => samplesBins[i])
				]
			} as uPlot.Options,
			data: [binsValues, ...transformed] as any
		}) ;
	}, [columns, sampleData, allData, applySample, showGrid]);

	const opts = hist?.(size);
	if (!opts) return <div className='Center'>EMPTY SAMPLE</div>;
	return (<div ref={setContainer} style={{ position: 'absolute' }} onClick={clickDownloadPlot}>
		<UplotReact {...opts}/>
	</div>);
}