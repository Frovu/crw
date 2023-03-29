import { useContext, useMemo, useState } from 'react';
import uPlot from 'uplot';
import UplotReact from 'uplot-react';
import { HistOptions } from '../table/Histogram';
import { DataContext, SettingsContext, TableContext } from '../table/Table';
import { useSize } from '../util';
import { axisDefaults, color } from './plotUtil';

export default function HistogramPlot() {
	const { data, columns } = useContext(TableContext);
	const { options: { hist: options }, settings: { plotGrid } } = useContext(SettingsContext);
	const { sample: currentSample } = useContext(DataContext);

	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const size = useSize(container?.parentElement);

	const hist = useMemo(() => {
		const samples = [0, 1, 2].map(i => {
			const type = options['sample'+i as keyof HistOptions];
			if (!type) return [];
			const colIdx = columns.findIndex(c => c.id === options['column'+i as keyof HistOptions]);
			// TODO: custom sample
			const sample = type === 'current' ? currentSample : data;
			return sample.map(row => row[colIdx]).filter(val => val != null);
		});
		const min = Math.min.apply(null, samples.flat());
		const max = Math.max.apply(null, samples.flat());
		const binCount = options.binCount;
		const binSize = (max - min) / binCount;
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
						range: (u, umin, umax) => [umin-binSize/4, umax+binSize]
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
				]
			} as uPlot.Options,
			data: [binsValues, ...transformed] as any
		}) ;
	}, [data, options, columns, currentSample, plotGrid]);

	return (<div ref={setContainer} style={{ position: 'absolute' }}>
		<UplotReact {...hist(size)}/>
	</div>);
}