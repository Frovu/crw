import { useContext, useMemo, useState } from 'react';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import { HistOptions } from '../table/Statistics';
import { SampleContext, SettingsContext, TableContext } from '../table/Table';
import { useSize } from '../util';
import { axisDefaults, clickDownloadPlot, color, drawBackground } from './plotUtil';
import { applySample } from '../table/Sample';

export default function HistogramPlot() {
	const { data, columns } = useContext(TableContext);
	const { options: { hist: options }, settings: { plotGrid } } = useContext(SettingsContext);
	const { data: currentSample, samples: samplesList } = useContext(SampleContext);

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	const hist = useMemo(() => {
		const cols = [0, 1, 2].map(i => columns.findIndex(c => c.id === options['column'+i as keyof HistOptions]));
		const allSamples = [0, 1, 2].map(i => {
			const sampleId = options['sample'+i as keyof HistOptions];
			const colIdx = cols[i];
			if (!sampleId || colIdx < 0) return [];
			const column = columns[colIdx];
			
			const sample = sampleId === 'current' ? currentSample : sampleId === 'none' ? data :
				applySample(data, samplesList.find(s => s.id.toString() === sampleId)!, columns);
			return sample.map(row => row[colIdx]).filter(val => val != null || column.type === 'enum');
		});
		const firstIdx = allSamples.findIndex(s => s.length);
		if (firstIdx < 0) return null;
		const column = columns[cols[firstIdx]];
		const enumMode = !!column.enum;
		const samples = enumMode ? [allSamples[firstIdx].map(v => !v ? 0 : (column.enum!.indexOf(v) + 1))] : allSamples;
		const everything = samples.flat();
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
				const bin = Math.floor((val - min) / binSize);
				if (bin >= 0 && bin < binCount)
					++bins[bin];
			}
			return bins;
		});
		// const maxLength = Math.max.apply(null, samples.map(s => s?.length || 0)); 
		const transformed = samplesBins.filter(b => b).map((bins, i) => options.yScale === '%' ? bins!.map(b => b / samples[i].length) : bins);
		const binsValues = transformed[0]?.map((v,i) => min + i*binSize) || [];
		
		return (asize: { width: number, height: number }) => ({
			options: {
				...asize,
				padding: [10, 4, 0, 0],
				legend: { show: false },
				cursor: { show: false, drag: { x: false, y: false, setScale: false } },
				axes: [
					{
						...axisDefaults(plotGrid),
						size: 30,
						space: 64,
						labelSize: 20,
						label: [0, 1, 2].map(i => options['column'+i as keyof HistOptions]).filter((c, i) => samplesBins[i])
							.map(c => columns.find(cc => cc.id === c)?.fullName).join(', '),
						values: (u, vals) => vals.map(v => v % 1 === 0 ? ('   ' + v.toFixed()) : ''),
						...(enumMode && {
							values: (u, vals) => vals.map(v => '     ' + (v % 1 === 0 ? ['N/A', ...column.enum!][v] : ''))
						}),
					},
					{
						...axisDefaults(plotGrid),
						values: (u, vals) => vals.map(v => v && (options.yScale === '%' ? (v*100).toFixed(0) + ' %' : v.toFixed())),
						size: 56,
						space: 48
					},
				],
				scales: {
					x: {
						time: false,
						range: (u, umin, umax) => [min-binSize/4, max+binSize/4]
					},
					y: {
						distr: options.yScale === 'log' ? 3 : 1
					}
		
				},
				series: [
					{},
					...[{
						stroke: color('magenta'),
						fill: color('magenta', .7),
						points: { show: false },
						paths: uPlot.paths.bars!({ size: [.8, 64], align: 1 })
					},
					{
						stroke: color('acid'),
						fill: color('acid'),
						points: { show: false },
						paths: uPlot.paths.bars!({ size: [.4, 64], align: 1 })
					},
					{
						stroke: color('cyan'),
						fill: color('cyan'),
						points: { show: false },
						paths: uPlot.paths.bars!({ size: [.2, 64], align: 1 })
					}].filter((ser, i) => samplesBins[i])
				],
				hooks: {
					drawClear: [ drawBackground ]
				}
			} as uPlot.Options,
			data: [binsValues, ...transformed] as any
		}) ;
	}, [data, options, columns, currentSample, plotGrid, samplesList]);

	const opts = hist?.(size);
	if (!opts) return <div className='Center'>EMPTY SAMPLE</div>;
	return (<div ref={setContainer} style={{ position: 'absolute' }} onClick={clickDownloadPlot}>
		<UplotReact {...opts}/>
	</div>);
}