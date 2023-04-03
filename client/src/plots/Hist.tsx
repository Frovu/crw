import { useContext, useMemo, useState } from 'react';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import { HistOptions } from '../table/Statistics';
import { SampleContext, SettingsContext, TableContext } from '../table/Table';
import { useSize } from '../util';
import { axisDefaults, clickDownloadPlot, color, drawBackground } from './plotUtil';

export default function HistogramPlot() {
	const { data, columns } = useContext(TableContext);
	const { options: { hist: options }, settings: { plotGrid } } = useContext(SettingsContext);
	const { data: currentSample } = useContext(SampleContext);

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	const hist = useMemo(() => {
		const samples = [0, 1, 2].map(i => {
			const type = options['sample'+i as keyof HistOptions];
			if (!type) return [];
			const colIdx = columns.findIndex(c => c.id === options['column'+i as keyof HistOptions]);

			const sample = type === 'current' ? currentSample : data;
			return sample.map(row => row[colIdx]).filter(val => val != null);
		});
		const everything = samples.flat();
		if (!everything.length) return null;
		const min = Math.min.apply(null, everything);
		let max = Math.max.apply(null, everything);
		const countMax = everything.reduce((a, b) => b === max ? a + 1 : a, 0);
		const binCount = options.binCount;
		if (countMax > 1)
			max += (max - min) / (binCount - 1);
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
		const maxLength = Math.max.apply(null, samples.map(s => s?.length || 0)); 
		const transformed = samplesBins.filter(b => b).map(bins => options.yScale === '%' ? bins!.map(b => b / maxLength) : bins);
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
						labelSize: 20,
						label: [0, 1, 2].map(i => options['column'+i as keyof HistOptions]).filter((c, i) => samplesBins[i])
							.map(c => columns.find(cc => cc.id === c)?.fullName).join(', ')
					},
					{
						...axisDefaults(plotGrid),
						values: (u, vals) => vals.map(v => v && (options.yScale === '%' ? (v*100).toFixed(0) + ' %' : v.toFixed())),
						size: 56
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
	}, [data, options, columns, currentSample, plotGrid]);

	const opts = hist?.(size);
	if (!opts) return <div className='Center'>EMPTY SAMPLE</div>;
	return (<div ref={setContainer} style={{ position: 'absolute' }} onClick={clickDownloadPlot}>
		<UplotReact {...opts}/>
	</div>);
}